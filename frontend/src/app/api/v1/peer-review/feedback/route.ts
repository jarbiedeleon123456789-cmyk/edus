import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { peerReviews, reviewScores, rubricCriteria, submissions } from "@/db/schema";
import { aliasFor, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

// Feedback on the student's own submissions. Reviewers appear as aliases — identities hidden both ways.
export async function GET(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;

  const rows = await db.select({
    reviewId: peerReviews.id, comment: peerReviews.overallComment, createdAt: peerReviews.createdAt,
    reviewerId: peerReviews.reviewerId, submissionId: peerReviews.submissionId, title: submissions.title,
  }).from(peerReviews)
    .innerJoin(submissions, eq(peerReviews.submissionId, submissions.id))
    .where(eq(submissions.userId, user.id))
    .orderBy(desc(peerReviews.createdAt));

  const scores = rows.length
    ? await db.select({
      reviewId: reviewScores.reviewId, score: reviewScores.score,
      label: rubricCriteria.label, maxPoints: rubricCriteria.maxPoints, position: rubricCriteria.position,
    }).from(reviewScores).innerJoin(rubricCriteria, eq(reviewScores.criterionId, rubricCriteria.id))
      .orderBy(asc(rubricCriteria.position))
    : [];
  const byReview = new Map<string, typeof scores>();
  for (const s of scores) {
    const e = byReview.get(s.reviewId) ?? [];
    e.push(s);
    byReview.set(s.reviewId, e);
  }

  return ok(rows.map((r) => {
    const sc = byReview.get(r.reviewId) ?? [];
    const total = sc.reduce((a, s) => a + s.score, 0);
    const max = sc.reduce((a, s) => a + s.maxPoints, 0);
    return {
      reviewId: r.reviewId, reviewerAlias: `Reviewer ${aliasFor(r.reviewerId)}`,
      title: r.title ?? "Submission", comment: r.comment, createdAt: r.createdAt,
      total, max, criteria: sc.map((s) => ({ label: s.label, score: s.score, maxPoints: s.maxPoints })),
    };
  }));
}
