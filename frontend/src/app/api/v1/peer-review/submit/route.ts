import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { peerAssignments, peerReviews, reviewScores, rubricCriteria, submissions } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { addXp, awardBadge, notify, touchStreak, XP } from "@/lib/server/gamify";

const schema = z.object({
  assignmentId: z.string().uuid(),
  comment: z.string().trim().min(20, "Write at least a sentence of feedback — 20 characters minimum.").max(4000),
  scores: z.array(z.object({
    criterionId: z.string().uuid(),
    score: z.number().int().min(0),
  })).min(1),
});

export async function POST(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { assignmentId, comment, scores } = parsed.data;

  const [assignment] = await db.select().from(peerAssignments).where(eq(peerAssignments.id, assignmentId)).limit(1);
  if (!assignment || assignment.reviewerId !== user.id) return fail("Assignment not found.", 404);
  if (assignment.status !== "pending") return fail("You've already reviewed this submission.", 409);

  const criteria = await db.select().from(rubricCriteria)
    .where(inArray(rubricCriteria.id, scores.map((s) => s.criterionId)));
  if (criteria.length !== scores.length) return fail("Unknown rubric criterion.", 422);
  for (const s of scores) {
    const c = criteria.find((c) => c.id === s.criterionId)!;
    if (s.score > c.maxPoints) return fail(`"${c.label}" is out of ${c.maxPoints} — score ${s.score} is too high.`, 422);
  }

  const review = { id: randomUUID() };
  await db.insert(peerReviews).values({
    id: review.id,
    assignmentId, submissionId: assignment.submissionId, reviewerId: user.id, overallComment: comment,
  });
  await db.insert(reviewScores).values(scores.map((s) => ({ reviewId: review.id, criterionId: s.criterionId, score: s.score })));
  await db.update(peerAssignments).set({ status: "submitted", completedAt: new Date() }).where(eq(peerAssignments.id, assignmentId));

  // When every assigned review is in, the submission leaves the queue.
  const pending = await db.select({ id: peerAssignments.id }).from(peerAssignments)
    .where(and(eq(peerAssignments.submissionId, assignment.submissionId), ne(peerAssignments.status, "submitted")));
  if (pending.length === 0) {
    await db.update(submissions).set({ status: "reviewed" }).where(eq(submissions.id, assignment.submissionId));
  }

  const [sub] = await db.select({ userId: submissions.userId, title: submissions.title }).from(submissions)
    .where(eq(submissions.id, assignment.submissionId)).limit(1);
  if (sub) {
    const maxTotal = criteria.reduce((a, c) => a + c.maxPoints, 0);
    const total = scores.reduce((a, s) => a + s.score, 0);
    await notify(sub.userId, "review_received", `New feedback on "${sub.title ?? "your submission"}"`,
      `A peer finished their review: ${total}/${maxTotal}. Read it on the Feedback page.`);
  }

  const { xp, level } = await addXp(user.id, XP.review);
  const streak = await touchStreak(user.id);
  const badges = [await awardBadge(user.id, "reviewer")].filter(Boolean);

  return ok({ xp, level, streak, badges }, "Review submitted. Thanks for the careful read.");
}
