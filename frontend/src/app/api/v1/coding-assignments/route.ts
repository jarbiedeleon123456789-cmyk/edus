import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  codingAssignmentAttempts, codingAssignments, codingExercises, courseEnrollments, courses,
  learningPaths, testCases,
} from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

const testCaseSchema = z.object({
  input: z.unknown().refine((value) => value !== undefined, "Each test case needs an input."),
  expected: z.unknown().refine((value) => value !== undefined, "Each test case needs an expected output."),
  hidden: z.boolean().default(false),
});

const createSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  prompt: z.string().trim().min(10).max(10_000),
  instructions: z.string().trim().max(10_000).default(""),
  starterCode: z.string().max(50_000),
  dueAt: z.string().datetime().nullable().optional(),
  published: z.boolean().default(true),
  testCases: z.array(testCaseSchema).min(1).max(30)
    .refine((cases) => cases.some((testCase) => !testCase.hidden), "Add at least one visible test case."),
});

export async function GET(req: Request) {
  const user = await requireRole(req, ["student", "instructor"]);
  if (user instanceof NextResponse) return user;

  if (user.role === "student") {
    const rows = await db.select({
      id: codingAssignments.id,
      exerciseId: codingAssignments.exerciseId,
      title: codingAssignments.title,
      instructions: codingAssignments.instructions,
      dueAt: codingAssignments.dueAt,
      course: courses.title,
      prompt: codingExercises.prompt,
      language: codingExercises.language,
      attemptCount: sql<number>`(
        select count(*) from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
      )`.as("attempt_count"),
      bestScore: sql<number | null>`(
        select max(aa.score) from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
      )`.as("best_score"),
      latestScore: sql<number | null>`(
        select aa.score from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
        order by aa.submitted_at desc limit 1
      )`.as("latest_score"),
      latestPassed: sql<number | null>`(
        select aa.passed_count from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
        order by aa.submitted_at desc limit 1
      )`.as("latest_passed"),
      latestTotal: sql<number | null>`(
        select aa.total_count from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
        order by aa.submitted_at desc limit 1
      )`.as("latest_total"),
      lastSubmittedAt: sql<Date | null>`(
        select aa.submitted_at from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
        order by aa.submitted_at desc limit 1
      )`.as("last_submitted_at"),
      lastAttemptLate: sql<boolean | null>`(
        select aa.is_late from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.user_id = ${user.id}
        order by aa.submitted_at desc limit 1
      )`.as("last_attempt_late"),
    }).from(codingAssignments)
      .innerJoin(courses, eq(codingAssignments.courseId, courses.id))
      .innerJoin(codingExercises, eq(codingAssignments.exerciseId, codingExercises.id))
      .where(and(
        eq(codingAssignments.published, true),
        or(
          inArray(codingAssignments.courseId, db.selectDistinct({ courseId: learningPaths.courseId })
            .from(learningPaths).where(eq(learningPaths.userId, user.id))),
          inArray(codingAssignments.courseId, db.selectDistinct({ courseId: courseEnrollments.courseId })
            .from(courseEnrollments).where(eq(courseEnrollments.userId, user.id))),
        ),
      ))
      .orderBy(asc(codingAssignments.dueAt), asc(codingAssignments.createdAt));

    return ok({
      assignments: rows.map((row) => ({
        ...row,
        isOverdue: row.dueAt !== null && row.dueAt.getTime() < Date.now(),
      })),
    });
  }

  const [ownedCourses, assignments] = await Promise.all([
    db.select({ id: courses.id, title: courses.title }).from(courses)
      .where(eq(courses.instructorId, user.id)).orderBy(asc(courses.title)),
    db.select({
      id: codingAssignments.id,
      courseId: codingAssignments.courseId,
      exerciseId: codingAssignments.exerciseId,
      course: courses.title,
      title: codingAssignments.title,
      instructions: codingAssignments.instructions,
      dueAt: codingAssignments.dueAt,
      published: codingAssignments.published,
      createdAt: codingAssignments.createdAt,
      studentCount: sql<number>`(
        select count(distinct student_id) from (
          select lp.user_id as student_id from ${learningPaths} lp where lp.course_id = ${codingAssignments.courseId}
          union
          select ce.user_id as student_id from ${courseEnrollments} ce where ce.course_id = ${codingAssignments.courseId}
        ) enrolled_students
      )`.as("student_count"),
      submittedCount: sql<number>`(
        select count(*) from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id}
      )`.as("submitted_count"),
      completedCount: sql<number>`(
        select count(distinct aa.user_id) from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id} and aa.score = 100
      )`.as("completed_count"),
      averageScore: sql<number | null>`(
        select round(avg(aa.score), 1) from ${codingAssignmentAttempts} aa
        where aa.assignment_id = ${codingAssignments.id}
      )`.as("average_score"),
    }).from(codingAssignments)
      .innerJoin(courses, eq(codingAssignments.courseId, courses.id))
      .where(eq(codingAssignments.instructorId, user.id))
      .orderBy(asc(codingAssignments.dueAt), asc(codingAssignments.createdAt)),
  ]);

  return ok({ courses: ownedCourses, assignments });
}

export async function POST(req: Request) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;

  const parsed = await parseBody(req, createSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const [course] = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, input.courseId), eq(courses.instructorId, instructor.id))).limit(1);
  if (!course) return fail("Choose a course you teach.", 403);

  const exerciseId = randomUUID();
  const assignmentId = randomUUID();
  const serialize = (value: unknown, field: string) => {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error(`Invalid JSON ${field} in test case.`);
    return result;
  };

  await db.transaction(async (tx) => {
    await tx.insert(codingExercises).values({
      id: exerciseId,
      courseId: input.courseId,
      title: input.title,
      prompt: input.prompt,
      language: "javascript",
      starterCode: input.starterCode,
    });
    await tx.insert(testCases).values(input.testCases.map((testCase, position) => ({
      id: randomUUID(),
      exerciseId,
      input: serialize(testCase.input, "input"),
      expected: serialize(testCase.expected, "expected output"),
      hidden: testCase.hidden,
      position,
    })));
    await tx.insert(codingAssignments).values({
      id: assignmentId,
      courseId: input.courseId,
      exerciseId,
      instructorId: instructor.id,
      title: input.title,
      instructions: input.instructions,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      published: input.published,
    });
  });

  return ok({ id: assignmentId, exerciseId }, input.published ? "Assignment published." : "Assignment saved as a draft.", 201);
}
