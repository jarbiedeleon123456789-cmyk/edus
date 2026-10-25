import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  courses, learningPathItems, learningPaths, lessonSkills, lessons, modules,
  progressRecords, skills, studentSkillScores,
} from "@/db/schema";
import { notify } from "./gamify";
import { issueCourseCertificate } from "./course-certification";

// Latest measured mastery (0-100) per skill for a user.
export async function masteryMap(userId: string) {
  const rows = await db.select({
    skillId: studentSkillScores.skillId, score: studentSkillScores.score, measuredAt: studentSkillScores.measuredAt,
  }).from(studentSkillScores).where(eq(studentSkillScores.userId, userId)).orderBy(desc(studentSkillScores.measuredAt));
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(r.skillId)) map.set(r.skillId, Number(r.score));
  return map;
}

// Completed lessons per day over the trailing 14 days. Sizes how many path items unlock at once.
export async function learningVelocity(userId: string) {
  const since = new Date(Date.now() - 14 * 864e5);
  const rows = await db.select({ d: progressRecords.completedAt }).from(progressRecords)
    .where(and(eq(progressRecords.userId, userId), gte(progressRecords.completedAt, since)));
  return Math.max(0.1, rows.length / 14);
}

const fmtList = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}` : (xs[0] ?? "");

export async function activePath(userId: string) {
  const [p] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.userId, userId), eq(learningPaths.status, "active"))).limit(1);
  return p ?? null;
}

export async function pathDetail(pathId: string) {
  const [p] = await db.select().from(learningPaths).where(eq(learningPaths.id, pathId)).limit(1);
  if (!p) return null;
  const items = await db.select({
    itemId: learningPathItems.id, position: learningPathItems.position, status: learningPathItems.status,
    completedAt: learningPathItems.completedAt, lessonId: lessons.id, title: lessons.title,
    estimatedMinutes: lessons.estimatedMinutes, moduleTitle: modules.title,
  }).from(learningPathItems)
    .innerJoin(lessons, eq(learningPathItems.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(learningPathItems.pathId, pathId))
    .orderBy(asc(learningPathItems.position));
  const [course] = await db.select().from(courses).where(eq(courses.id, p.courseId)).limit(1);
  return { path: p, items, course };
}

// Creates the path if none is active, or rebuilds the open items when regenerate=true.
export async function generatePath(userId: string, regenerate = false) {
  const mastery = await masteryMap(userId);
  const existing = await activePath(userId);
  if (existing && !regenerate) return { pathId: existing.id, created: false };

  const [course] = await db.select().from(courses).where(eq(courses.slug, "js-foundations")).limit(1);
  if (!course) throw new Error("No course available to build a path from.");
  const courseId = existing?.courseId ?? course.id;

  const rows = await db.select({
    lessonId: lessons.id, title: lessons.title, pos: lessons.position, modPos: modules.position,
    skillId: lessonSkills.skillId, skillName: skills.name,
  }).from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .leftJoin(lessonSkills, eq(lessonSkills.lessonId, lessons.id))
    .leftJoin(skills, eq(lessonSkills.skillId, skills.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position));

  const byLesson = new Map<string, { title: string; pos: number; modPos: number; skills: { id: string; name: string }[] }>();
  for (const r of rows) {
    const e = byLesson.get(r.lessonId) ?? { title: r.title, pos: r.pos, modPos: r.modPos, skills: [] };
    if (r.skillId && r.skillName) e.skills.push({ id: r.skillId, name: r.skillName });
    byLesson.set(r.lessonId, e);
  }

  // A lesson's gap score is the average mastery gap across its skills; weakest lessons go first.
  const gapOf = (l: { skills: { id: string }[] }) =>
    l.skills.length === 0 ? 50 : l.skills.reduce((acc, sk) => acc + (100 - (mastery.get(sk.id) ?? 0)), 0) / l.skills.length;

  let doneIds: Set<string> = new Set();
  let doneCount = 0;
  let pathId: string;

  if (existing) {
    pathId = existing.id;
    const items = await db.select().from(learningPathItems).where(eq(learningPathItems.pathId, pathId));
    const done = items.filter((i) => i.status === "done");
    doneIds = new Set(done.map((i) => i.lessonId));
    doneCount = done.length;
    await db.delete(learningPathItems).where(and(eq(learningPathItems.pathId, pathId), ne(learningPathItems.status, "done")));
  } else {
    pathId = randomUUID();
    await db.insert(learningPaths).values({ id: pathId, userId, courseId, rationale: "" });
  }

  const open = [...byLesson.entries()]
    .filter(([id]) => !doneIds.has(id))
    .map(([lessonId, l]) => ({ lessonId, ...l, gap: gapOf(l) }))
    .sort((a, b) => b.gap - a.gap || a.modPos - b.modPos || a.pos - b.pos);

  if (open.length === 0) {
    // Everything already done — close the path instead of leaving it empty.
    await db.update(learningPaths).set({ status: "completed", completedAt: new Date() }).where(eq(learningPaths.id, pathId));
    return { pathId, created: false };
  }

  const velocity = await learningVelocity(userId);
  const unlockCount = Math.max(1, Math.min(4, Math.round(velocity * 4)));

  await db.insert(learningPathItems).values(open.map((o, i) => ({
    pathId, lessonId: o.lessonId, position: doneCount + i, status: i < unlockCount ? "current" as const : "locked" as const,
  })));

  const weakest = [...mastery.entries()].filter(([, v]) => v < 60).sort((a, b) => a[1] - b[1]).slice(0, 4);
  const skillName = new Map([...byLesson.values()].flatMap((l) => l.skills.map((sk) => [sk.id, sk.name] as const)));
  const weakNames = weakest.map(([id, v]) => `${skillName.get(id) ?? "Unrated skill"} at ${Math.round(v)}%`);
  const firstTitles = open.slice(0, 3).map((o) => `"${o.title}"`);
  const rationale = mastery.size === 0
    ? `No placement scores yet, so the path follows the course order. Based on your recent pace of ${velocity.toFixed(1)} lessons/day, ${unlockCount} item${unlockCount > 1 ? "s are" : " is"} open at a time. Finish the placement assessment and the path re-sequences around your gaps.`
    : `Your weakest measured skills: ${fmtList(weakNames) || "none below 60%"}. The path re-sequences the course so ${fmtList(firstTitles)} come first and keeps anything you already finished. At your recent pace of ${velocity.toFixed(1)} lessons/day, ${unlockCount} item${unlockCount > 1 ? "s are" : " is"} open at a time.`;

  await db.update(learningPaths).set({ velocity: velocity.toFixed(2), rationale }).where(eq(learningPaths.id, pathId));
  if (!existing) await notify(userId, "path", "Your learning path is ready", `${open.length} lessons sequenced around your placement gaps.`);
  return { pathId, created: !existing, velocity, unlockCount };
}

export type CompleteResult =
  | { error: string; status: number }
  | { ok: true; completed: boolean; certificateCode?: string; pathId: string; courseId: string };

// Marks a path item done, promotes the next locked item if a slot is free, closes the path when empty.
export async function completePathItem(pathItemId: string, userId: string): Promise<CompleteResult> {
  const [item] = await db.select().from(learningPathItems).where(eq(learningPathItems.id, pathItemId)).limit(1);
  if (!item) return { error: "Path item not found.", status: 404 as const };
  const [path] = await db.select().from(learningPaths).where(eq(learningPaths.id, item.pathId)).limit(1);
  if (!path || path.userId !== userId) return { error: "Path item not found.", status: 404 as const };
  if (item.status === "done") return { error: "Already completed.", status: 409 as const };
  if (item.status === "locked") return { error: "This lesson unlocks after you finish the open ones.", status: 409 as const };

  await db.update(learningPathItems).set({ status: "done", completedAt: new Date() }).where(eq(learningPathItems.id, item.id));
  await db.insert(progressRecords).values({
    id: randomUUID(), userId, lessonId: item.lessonId, timeSpentSec: 0,
  }).onDuplicateKeyUpdate({ set: { userId } });

  const remaining = await db.select().from(learningPathItems)
    .where(and(eq(learningPathItems.pathId, path.id), inArray(learningPathItems.status, ["current", "locked"])))
    .orderBy(asc(learningPathItems.position));

  if (remaining.length === 0) {
    await db.update(learningPaths).set({ status: "completed", completedAt: new Date() }).where(eq(learningPaths.id, path.id));
    const certificateCode = await issueCourseCertificate(userId, path.courseId);
    return {
      ok: true as const, completed: true, ...(certificateCode ? { certificateCode } : {}),
      pathId: path.id, courseId: path.courseId,
    };
  }

  const slots = Math.max(1, Math.min(4, Math.round(Number(path.velocity) * 4)));
  const openNow = remaining.filter((i) => i.status === "current").length;
  if (openNow < slots) {
    const next = remaining.find((i) => i.status === "locked");
    if (next) await db.update(learningPathItems).set({ status: "current" }).where(eq(learningPathItems.id, next.id));
  }
  return { ok: true as const, completed: false, pathId: path.id, courseId: path.courseId };
}
