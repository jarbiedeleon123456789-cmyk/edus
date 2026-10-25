import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codingExercises, courses, peerAssignments, rubricCriteria, rubrics, submissions } from "@/db/schema";
import { aliasFor, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

// The queue is deliberately anonymous: aliases only, never user IDs or names.
export async function GET(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;

  const rows = await db.select({
    assignmentId: peerAssignments.id, status: peerAssignments.status, assignedAt: peerAssignments.assignedAt,
    submissionAuthor: submissions.userId, title: submissions.title, code: submissions.code,
    language: submissions.language, submittedAt: submissions.createdAt,
    exerciseTitle: codingExercises.title, prompt: codingExercises.prompt, courseId: codingExercises.courseId,
  }).from(peerAssignments)
    .innerJoin(submissions, eq(peerAssignments.submissionId, submissions.id))
    .leftJoin(codingExercises, eq(submissions.exerciseId, codingExercises.id))
    .where(eq(peerAssignments.reviewerId, user.id))
    .orderBy(asc(peerAssignments.status), desc(peerAssignments.assignedAt));

  const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean))] as string[];
  const rubricRows = courseIds.length
    ? await db.select({
      id: rubrics.id, title: rubrics.title, courseId: rubrics.courseId,
      criterionId: rubricCriteria.id, label: rubricCriteria.label, description: rubricCriteria.description,
      maxPoints: rubricCriteria.maxPoints, position: rubricCriteria.position,
    }).from(rubrics)
      .innerJoin(rubricCriteria, eq(rubricCriteria.rubricId, rubrics.id))
      .orderBy(asc(rubricCriteria.position))
    : [];

  const rubricByCourse = new Map<string, { title: string; criteria: { id: string; label: string; description: string; maxPoints: number }[] }>();
  for (const r of rubricRows) {
    const e = rubricByCourse.get(r.courseId) ?? { title: r.title, criteria: [] };
    e.criteria.push({ id: r.criterionId, label: r.label, description: r.description, maxPoints: r.maxPoints });
    rubricByCourse.set(r.courseId, e);
  }
  const fallback = rubricByCourse.values().next().value ?? null;

  return ok(rows.map((r) => ({
    assignmentId: r.assignmentId,
    status: r.status,
    assignedAt: r.assignedAt,
    submittedAt: r.submittedAt,
    authorAlias: `Author ${aliasFor(r.submissionAuthor)}`,
    title: r.title ?? r.exerciseTitle ?? "Assignment",
    prompt: r.prompt,
    code: r.code,
    language: r.language,
    rubric: (r.courseId ? rubricByCourse.get(r.courseId) : null) ?? fallback,
  })));
}
