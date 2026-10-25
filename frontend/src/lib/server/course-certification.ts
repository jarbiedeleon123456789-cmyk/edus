import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates, codingAssignmentAttempts, codingAssignments, finalAssessmentAttempts,
  finalAssessmentQuestions, finalAssessments, learningPathItems, learningPaths, lessons, modules, progressRecords,
} from "@/db/schema";
import { notify } from "./gamify";

export async function issueCourseCertificate(userId: string, courseId: string): Promise<string | null> {
  const [existingCertificate] = await db.select({ code: certificates.code }).from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId))).limit(1);
  if (existingCertificate) return existingCertificate.code;

  const [lessonCounts] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when
      exists (select 1 from ${progressRecords} pr where pr.lesson_id = ${lessons.id} and pr.user_id = ${userId})
      or exists (
        select 1 from ${learningPathItems} lpi join ${learningPaths} lp on lp.id = lpi.path_id
        where lpi.lesson_id = ${lessons.id} and lpi.status = 'done' and lp.user_id = ${userId}
      ) then 1 else 0 end)`,
  }).from(lessons).innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId));
  if (!Number(lessonCounts.total) || Number(lessonCounts.completed) < Number(lessonCounts.total)) return null;

  const assignments = await db.select({ id: codingAssignments.id }).from(codingAssignments)
    .where(and(eq(codingAssignments.courseId, courseId), eq(codingAssignments.published, true)));
  if (!assignments.length) return null;
  const attempts = await db.select({
    assignmentId: codingAssignmentAttempts.assignmentId,
    score: codingAssignmentAttempts.score,
  }).from(codingAssignmentAttempts)
    .where(and(
      eq(codingAssignmentAttempts.userId, userId),
      inArray(codingAssignmentAttempts.assignmentId, assignments.map((assignment) => assignment.id)),
    ));
  const passedIds = new Set(attempts.filter((attempt) => Number(attempt.score) >= 100).map((attempt) => attempt.assignmentId));
  if (assignments.some((assignment) => !passedIds.has(assignment.id))) return null;

  const [assessment] = await db.select().from(finalAssessments).where(eq(finalAssessments.courseId, courseId)).limit(1);
  if (!assessment) return null;
  const [questionCount] = await db.select({ count: sql<number>`count(*)` }).from(finalAssessmentQuestions)
    .where(eq(finalAssessmentQuestions.assessmentId, assessment.id));
  if (!Number(questionCount.count)) return null;
  const [passedAttempt] = await db.select({ id: finalAssessmentAttempts.id }).from(finalAssessmentAttempts)
    .where(and(
      eq(finalAssessmentAttempts.assessmentId, assessment.id),
      eq(finalAssessmentAttempts.userId, userId),
      eq(finalAssessmentAttempts.passed, true),
    )).limit(1);
  if (!passedAttempt) return null;

  const code = `EDU-${randomBytes(4).toString("hex").slice(0, 4).toUpperCase()}-${randomBytes(4).toString("hex").slice(0, 4).toUpperCase()}`;
  try {
    await db.insert(certificates).values({ id: randomUUID(), userId, courseId, code });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY")) throw error;
    const [concurrentCertificate] = await db.select({ code: certificates.code }).from(certificates)
      .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId))).limit(1);
    if (!concurrentCertificate) throw error;
    return concurrentCertificate.code;
  }
  await notify(userId, "certificate", "Certificate issued", `Course complete. Certificate ${code} is live at /verify/${code}.`);
  return code;
}
