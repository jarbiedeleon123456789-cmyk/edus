import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { codingExercises, courses, peerAssignments, peerReviews, reviewScores, submissions, users } from "@/db/schema";
import { aliasFor, fail, ok, parseBody } from "@/lib/server/api";
import { requireRole, requireUser } from "@/lib/server/auth";
import { assignReviewers } from "@/lib/server/assigner";

const createSchema = z.object({
  exerciseId: z.string().uuid(),
  code: z.string().min(1, "Add some code before submitting.").max(100_000),
  language: z.string().max(20).default("html"),
});

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  // Instructors see the class-wide grading view; students see only their own work.
  const base = db.select({
    id: submissions.id, kind: submissions.kind, title: submissions.title, status: submissions.status,
    language: submissions.language, code: submissions.code, createdAt: submissions.createdAt,
    exercise: codingExercises.title, author: users.name, authorId: users.id,
    courseInstructorId: courses.instructorId,
    reviewers: sql<number>`(select count(*) from ${peerAssignments} pa where pa.submission_id = ${submissions.id})`.as("reviewers"),
    reviewsDone: sql<number>`(select count(*) from ${peerReviews} pr where pr.submission_id = ${submissions.id})`.as("reviews_done"),
    avgScore: sql<number | null>`(
      select round(avg(rs.score), 1) from ${reviewScores} rs
      join ${peerReviews} pr on pr.id = rs.review_id where pr.submission_id = ${submissions.id}
    )`.as("avg_score"),
  }).from(submissions)
    .leftJoin(codingExercises, eq(submissions.exerciseId, codingExercises.id))
    .leftJoin(courses, eq(codingExercises.courseId, courses.id))
    .innerJoin(users, eq(submissions.userId, users.id))
    .orderBy(desc(submissions.createdAt));

  const rows = user.role === "student"
    ? await base.where(eq(submissions.userId, user.id))
    : user.role === "instructor"
      ? await base.where(eq(courses.instructorId, user.id))
      : await base;

  return ok(rows.map((r) => (user.role === "student"
    ? { ...r, code: undefined, author: undefined, authorId: undefined, courseInstructorId: undefined }
    : { ...r, authorAlias: aliasFor(r.authorId), courseInstructorId: undefined })));
}

// A submitted assignment goes straight into the anonymous peer-review pool (3 reviewers).
export async function POST(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, createSchema);
  if ("error" in parsed) return parsed.error;

  const [exercise] = await db.select().from(codingExercises).where(eq(codingExercises.id, parsed.data.exerciseId)).limit(1);
  if (!exercise) return fail("Exercise not found.", 404);

  const id = randomUUID();
  await db.insert(submissions).values({
    id,
    userId: user.id, exerciseId: exercise.id, kind: "assignment", title: exercise.title.replace(/^Assignment — /, ""),
    code: parsed.data.code, language: parsed.data.language,
  });

  const assigned = await assignReviewers(id, user.id, 3);
  return ok({ id, assigned }, assigned > 0
    ? `Submitted. ${assigned} anonymous classmates will review it.`
    : "Submitted, but no classmates are available to review it yet.", 201);
}
