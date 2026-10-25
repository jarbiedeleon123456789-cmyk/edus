import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  executionResults, learningPathItems, learningPaths, lessons, modules, peerAssignments,
  progressRecords, skills, streaks, studentSkillScores, userBadges,
} from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { levelFromXp } from "@/lib/server/gamify";

export async function GET(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;

  // Latest mastery reading per skill.
  const rawScores = await db.select({
    skill: skills.name, score: studentSkillScores.score, measuredAt: studentSkillScores.measuredAt,
  }).from(studentSkillScores)
    .innerJoin(skills, eq(studentSkillScores.skillId, skills.id))
    .where(eq(studentSkillScores.userId, user.id))
    .orderBy(desc(studentSkillScores.measuredAt));
  const seen = new Set<string>();
  const mastery = rawScores.filter((r) => (seen.has(r.skill) ? false : (seen.add(r.skill), true)))
    .map((r) => ({ skill: r.skill, score: Math.round(Number(r.score)) }));

  const [streak] = await db.select().from(streaks).where(eq(streaks.userId, user.id)).limit(1);

  const lessonAgg = await db.select({
    done: sql<number>`count(*)`,
    minutes: sql<number>`coalesce(sum(${progressRecords.timeSpentSec}),0) / 60`,
  }).from(progressRecords).where(eq(progressRecords.userId, user.id));

  const [pathAgg] = await db.select({
    total: sql<number>`count(*)`,
    done: sql<number>`coalesce(sum(case when ${learningPathItems.status} = 'done' then 1 else 0 end), 0)`,
  }).from(learningPathItems)
    .innerJoin(learningPaths, eq(learningPathItems.pathId, learningPaths.id))
    .where(and(eq(learningPaths.userId, user.id), eq(learningPaths.status, "active")));

  const execs = await db.select({ createdAt: executionResults.createdAt }).from(executionResults)
    .where(eq(executionResults.userId, user.id)).orderBy(desc(executionResults.createdAt)).limit(500);
  const lessonCompleted = await db.select({ completedAt: progressRecords.completedAt }).from(progressRecords)
    .where(eq(progressRecords.userId, user.id));

  // 28-day activity series: lessons finished + code runs per day.
  const days: { date: string; lessons: number; runs: number }[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ date: d, lessons: 0, runs: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  for (const r of lessonCompleted) {
    const i = dayIndex.get(r.completedAt.toISOString().slice(0, 10));
    if (i !== undefined) days[i].lessons++;
  }
  for (const r of execs) {
    const i = dayIndex.get(r.createdAt.toISOString().slice(0, 10));
    if (i !== undefined) days[i].runs++;
  }

  const [badgesAgg] = await db.select({ count: sql<number>`count(*)` }).from(userBadges).where(eq(userBadges.userId, user.id));
  const [reviewsGiven] = await db.select({ count: sql<number>`coalesce(sum(case when ${peerAssignments.status} = 'submitted' then 1 else 0 end), 0)` })
    .from(peerAssignments).where(eq(peerAssignments.reviewerId, user.id));

  const [activePathRow] = await db.select({ velocity: learningPaths.velocity }).from(learningPaths)
    .where(and(eq(learningPaths.userId, user.id), eq(learningPaths.status, "active"))).limit(1);

  const level = levelFromXp(user.xp);
  const nextLevelXp = Math.pow(level, 2) * 100;

  return ok({
    xp: user.xp, level, nextLevelXp,
    streak: { current: streak?.current ?? 0, longest: streak?.longest ?? 0 },
    mastery,
    lessonsDone: Number(lessonAgg[0]?.done ?? 0),
    minutesSpent: Number(lessonAgg[0]?.minutes ?? 0),
    path: { done: Number(pathAgg?.done ?? 0), total: Number(pathAgg?.total ?? 0) },
    velocity: Number(activePathRow?.velocity ?? 0),
    runs: execs.length,
    badgesCount: Number(badgesAgg?.count ?? 0),
    reviewsGiven: Number(reviewsGiven?.count ?? 0),
    activity: days,
  });
}
