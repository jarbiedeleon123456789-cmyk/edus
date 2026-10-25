import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { codingAssignments, codingAssignmentAttempts, codingExercises, courseEnrollments, courses, learningPaths } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

const updateSchema = z.object({
  published: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
}).refine((value) => value.published !== undefined || value.dueAt !== undefined, "Change a publish setting or due date.");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await requireRole(req, ["student"]);
  if (student instanceof NextResponse) return student;
  const { id } = await params;

  const [row] = await db.select({
    id: codingAssignments.id,
    exerciseId: codingAssignments.exerciseId,
    title: codingAssignments.title,
    instructions: codingAssignments.instructions,
    dueAt: codingAssignments.dueAt,
    course: courses.title,
    prompt: codingExercises.prompt,
    language: codingExercises.language,
    starterCode: codingExercises.starterCode,
  }).from(codingAssignments)
    .innerJoin(courses, eq(codingAssignments.courseId, courses.id))
    .innerJoin(codingExercises, eq(codingAssignments.exerciseId, codingExercises.id))
    .where(and(
      eq(codingAssignments.id, id),
      eq(codingAssignments.published, true),
      or(
        inArray(codingAssignments.courseId, db.selectDistinct({ courseId: learningPaths.courseId }).from(learningPaths)
          .where(eq(learningPaths.userId, student.id))),
        inArray(codingAssignments.courseId, db.selectDistinct({ courseId: courseEnrollments.courseId }).from(courseEnrollments)
          .where(eq(courseEnrollments.userId, student.id))),
      ),
    )).limit(1);

  if (!row) return fail("Assignment not found or not available to your account.", 404);

  const attempts = await db.select({
    id: codingAssignmentAttempts.id,
    score: codingAssignmentAttempts.score,
    passedCount: codingAssignmentAttempts.passedCount,
    totalCount: codingAssignmentAttempts.totalCount,
    isLate: codingAssignmentAttempts.isLate,
    submittedAt: codingAssignmentAttempts.submittedAt,
  }).from(codingAssignmentAttempts)
    .where(and(
      eq(codingAssignmentAttempts.assignmentId, id),
      eq(codingAssignmentAttempts.userId, student.id),
    ))
    .orderBy(codingAssignmentAttempts.submittedAt);

  return ok({ ...row, attempts });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id } = await params;
  const parsed = await parseBody(req, updateSchema);
  if ("error" in parsed) return parsed.error;

  const [assignment] = await db.select({ id: codingAssignments.id }).from(codingAssignments)
    .where(and(eq(codingAssignments.id, id), eq(codingAssignments.instructorId, instructor.id))).limit(1);
  if (!assignment) return fail("Assignment not found.", 404);

  const updates: { published?: boolean; dueAt?: Date | null } = {};
  if (parsed.data.published !== undefined) updates.published = parsed.data.published;
  if (parsed.data.dueAt !== undefined) updates.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  await db.update(codingAssignments).set(updates).where(eq(codingAssignments.id, id));
  return ok({ id }, parsed.data.published === false ? "Assignment unpublished." : "Assignment updated.");
}
