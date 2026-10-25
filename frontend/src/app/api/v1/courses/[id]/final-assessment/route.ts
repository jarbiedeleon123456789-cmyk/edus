import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { finalAssessmentAttempts, finalAssessmentQuestions, finalAssessments, courses, courseEnrollments, learningPaths } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { issueCourseCertificate } from "@/lib/server/course-certification";

const questionSchema = z.object({
  prompt: z.string().trim().min(5).max(2000),
  options: z.array(z.string().trim().min(1).max(500)).length(4),
  correctOption: z.number().int().min(0).max(3),
  points: z.number().int().min(1).max(100).default(1),
});
const saveSchema = z.object({
  title: z.string().trim().min(3).max(160),
  passScore: z.number().int().min(50).max(100).default(80),
  questions: z.array(questionSchema).min(1).max(100),
});
const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().uuid(), selectedOption: z.number().int().min(0).max(3) })).min(1),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id: courseId } = await params;
  const parsed = await parseBody(req, saveSchema);
  if ("error" in parsed) return parsed.error;
  const [course] = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, instructor.id))).limit(1);
  if (!course) return fail("Course not found in your instructor account.", 404);

  const [existing] = await db.select({ id: finalAssessments.id }).from(finalAssessments)
    .where(eq(finalAssessments.courseId, courseId)).limit(1);
  const assessmentId = existing?.id ?? randomUUID();
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(finalAssessments).set({ title: parsed.data.title, passScore: parsed.data.passScore })
        .where(eq(finalAssessments.id, assessmentId));
      await tx.delete(finalAssessmentQuestions).where(eq(finalAssessmentQuestions.assessmentId, assessmentId));
    } else {
      await tx.insert(finalAssessments).values({
        id: assessmentId, courseId, title: parsed.data.title, passScore: parsed.data.passScore,
      });
    }
    await tx.insert(finalAssessmentQuestions).values(parsed.data.questions.map((question, position) => ({
      id: randomUUID(), assessmentId, ...question, position,
    })));
  });
  return ok({ id: assessmentId }, "Final assessment saved.");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await requireRole(req, ["student"]);
  if (student instanceof NextResponse) return student;
  const { id: courseId } = await params;
  const parsed = await parseBody(req, submitSchema);
  if ("error" in parsed) return parsed.error;

  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, student.id))).limit(1);
  const [legacyPath] = !enrollment
    ? await db.select({ id: learningPaths.id }).from(learningPaths)
      .where(and(eq(learningPaths.courseId, courseId), eq(learningPaths.userId, student.id))).limit(1)
    : [null];
  if (!enrollment && !legacyPath) return fail("Enroll in this course before taking its final assessment.", 403);
  const [assessment] = await db.select().from(finalAssessments).where(eq(finalAssessments.courseId, courseId)).limit(1);
  if (!assessment) return fail("This course has no final assessment yet.", 404);
  const questions = await db.select({
    id: finalAssessmentQuestions.id,
    correctOption: finalAssessmentQuestions.correctOption,
    points: finalAssessmentQuestions.points,
  }).from(finalAssessmentQuestions)
    .where(eq(finalAssessmentQuestions.assessmentId, assessment.id))
    .orderBy(asc(finalAssessmentQuestions.position));
  if (!questions.length) return fail("The final assessment has no questions.", 409);
  const answerMap = new Map(parsed.data.answers.map((answer) => [answer.questionId, answer.selectedOption]));
  if (answerMap.size !== questions.length || questions.some((question) => !answerMap.has(question.id))) {
    return fail("Answer every question exactly once.", 422);
  }

  const earned = questions.reduce((sum, question) =>
    sum + (answerMap.get(question.id) === question.correctOption ? question.points : 0), 0);
  const possible = questions.reduce((sum, question) => sum + question.points, 0);
  const score = Math.round((earned / possible) * 10000) / 100;
  const passed = score >= assessment.passScore;
  await db.insert(finalAssessmentAttempts).values({
    id: randomUUID(), assessmentId: assessment.id, userId: student.id, score: String(score), passed,
  });

  const certificateCode = passed ? await issueCourseCertificate(student.id, courseId) : null;
  return ok({ score, passed, passScore: assessment.passScore, certificateCode },
    passed ? (certificateCode ? "Passed. Course certificate issued." : "Passed. Complete all course lessons and coding assignments to earn the certificate.")
      : `Scored ${score}%. ${assessment.passScore}% is required to pass.`);
}
