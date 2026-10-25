import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  certificates, codingAssignmentAttempts, codingAssignments, courseEnrollments, courseMaterials, courses,
  finalAssessmentAttempts, finalAssessmentQuestions, finalAssessments, learningPaths,
  learningPathItems, lessons, modules, progressRecords, users,
} from "@/db/schema";
import { fail, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { requireRole } from "@/lib/server/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail("Request body must be valid JSON.", 400); }
  if (!body || typeof body !== "object" || !("published" in body) || typeof body.published !== "boolean") {
    return fail("Set published to true or false.", 422);
  }
  const [course] = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, id), eq(courses.instructorId, instructor.id))).limit(1);
  if (!course) return fail("Course not found.", 404);

  if (body.published) {
    const [content] = await db.select({
      lessonCount: sql<number>`(select count(*) from ${lessons} l join ${modules} m on m.id = l.module_id where m.course_id = ${id})`,
      assignmentCount: sql<number>`(select count(*) from ${codingAssignments} ca where ca.course_id = ${id} and ca.published = 1)`,
      assessmentId: sql<string>`(select fa.id from ${finalAssessments} fa where fa.course_id = ${id} limit 1)`,
    }).from(courses).where(eq(courses.id, id)).limit(1);
    const [questionCount] = content.assessmentId
      ? await db.select({ count: sql<number>`count(*)` }).from(finalAssessmentQuestions)
        .where(eq(finalAssessmentQuestions.assessmentId, content.assessmentId))
      : [{ count: 0 }];
    if (!Number(content.lessonCount) || !Number(content.assignmentCount) || !Number(questionCount.count)) {
      return fail("Before publishing, add at least one lesson, one published coding assignment, and a final assessment with questions.", 409);
    }
  }

  await db.update(courses).set({ published: body.published }).where(eq(courses.id, id));
  return ok({ id, published: body.published }, body.published ? "Course published." : "Course unpublished.");
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const [course] = await db.select({
    id: courses.id,
    title: courses.title,
    description: courses.description,
    level: courses.level,
    published: courses.published,
    instructorId: courses.instructorId,
    instructor: users.name,
  }).from(courses).innerJoin(users, eq(courses.instructorId, users.id))
    .where(eq(courses.id, id)).limit(1);
  if (!course || (!course.published && course.instructorId !== user.id)) return fail("Course not found.", 404);

  const [enrollment] = user.role === "student"
    ? await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, id), eq(courseEnrollments.userId, user.id))).limit(1)
    : [null];
  let legacyPath: { id: string } | undefined;
  if (user.role === "student" && !enrollment) {
    [legacyPath] = await db.select({ id: learningPaths.id }).from(learningPaths)
      .where(and(eq(learningPaths.courseId, id), eq(learningPaths.userId, user.id))).limit(1);
  }
  const canView = user.role !== "student"
    ? course.instructorId === user.id || user.role === "admin"
    : !!enrollment || !!legacyPath;

  const courseModules = await db.select({
    id: modules.id,
    title: modules.title,
    position: modules.position,
  }).from(modules).where(eq(modules.courseId, id)).orderBy(asc(modules.position));

  let moduleDetails: {
    id: string; title: string; position: number;
    lessons: { id: string; title: string; content: string; estimatedMinutes: number; position: number; completed: boolean }[];
    materials: { id: string; name: string; contentType: string; bytes: number }[];
  }[] = [];

  if (canView) {
    moduleDetails = await Promise.all(courseModules.map(async (module) => {
      const [moduleLessons, materials] = await Promise.all([
        db.select({
          id: lessons.id,
          title: lessons.title,
          content: lessons.content,
          estimatedMinutes: lessons.estimatedMinutes,
          position: lessons.position,
        }).from(lessons).where(eq(lessons.moduleId, module.id)).orderBy(asc(lessons.position)),
        db.select({
          id: courseMaterials.id,
          name: courseMaterials.name,
          contentType: courseMaterials.contentType,
          bytes: courseMaterials.bytes,
        }).from(courseMaterials).where(eq(courseMaterials.moduleId, module.id)),
      ]);
      let completedIds = new Set<string>();
      if (user.role === "student" && moduleLessons.length) {
        const lessonIds = moduleLessons.map((lesson) => lesson.id);
        const [records, pathItems] = await Promise.all([
          db.select({ lessonId: progressRecords.lessonId }).from(progressRecords)
            .where(and(eq(progressRecords.userId, user.id), inArray(progressRecords.lessonId, lessonIds))),
          db.select({ lessonId: learningPathItems.lessonId }).from(learningPathItems)
            .innerJoin(learningPaths, eq(learningPathItems.pathId, learningPaths.id))
            .where(and(
              eq(learningPaths.userId, user.id), eq(learningPathItems.status, "done"),
              inArray(learningPathItems.lessonId, lessonIds),
            )),
        ]);
        completedIds = new Set([...records, ...pathItems].map((record) => record.lessonId));
      }
      return {
        ...module,
        lessons: moduleLessons.map((lesson) => ({ ...lesson, completed: completedIds.has(lesson.id) })),
        materials,
      };
    }));
  }

  const [requirements, certificate, assessment] = await Promise.all([
    db.select({
      lessons: sql<number>`(select count(*) from ${lessons} l join ${modules} m on m.id = l.module_id where m.course_id = ${id})`,
      completedLessons: sql<number>`(
        select count(*) from ${lessons} l
        join ${modules} m on m.id = l.module_id
        where m.course_id = ${id} and (
          exists (select 1 from ${progressRecords} pr where pr.lesson_id = l.id and pr.user_id = ${user.id})
          or exists (
            select 1 from ${learningPathItems} lpi join ${learningPaths} lp on lp.id = lpi.path_id
            where lpi.lesson_id = l.id and lpi.status = 'done' and lp.user_id = ${user.id}
          )
        )
      )`,
      assignments: sql<number>`(select count(*) from ${codingAssignments} ca where ca.course_id = ${id} and ca.published = 1)`,
      passedAssignments: sql<number>`(
        select count(*) from ${codingAssignments} ca
        where ca.course_id = ${id} and ca.published = 1
        and exists (select 1 from ${codingAssignmentAttempts} aa
          where aa.assignment_id = ca.id and aa.user_id = ${user.id} and aa.score = 100)
      )`,
    }).from(courses).where(eq(courses.id, id)).limit(1),
    canView
      ? db.select({ code: certificates.code }).from(certificates)
        .where(and(eq(certificates.courseId, id), eq(certificates.userId, user.id))).limit(1)
      : Promise.resolve([]),
    db.select().from(finalAssessments).where(eq(finalAssessments.courseId, id)).limit(1),
  ]);

  const certificateRow = certificate[0]?.code;

  let finalAssessment: {
    id: string; title: string; passScore: number;
    questions: { id: string; prompt: string; options: string[]; points: number }[];
    bestScore: number | null; passed: boolean;
  } | null = null;

  if (assessment[0] && canView) {
    const [questions, attempts] = await Promise.all([
      db.select({
        id: finalAssessmentQuestions.id,
        prompt: finalAssessmentQuestions.prompt,
        options: finalAssessmentQuestions.options,
        points: finalAssessmentQuestions.points,
      }).from(finalAssessmentQuestions)
        .where(eq(finalAssessmentQuestions.assessmentId, assessment[0].id))
        .orderBy(asc(finalAssessmentQuestions.position)),
      db.select({ score: finalAssessmentAttempts.score, passed: finalAssessmentAttempts.passed })
        .from(finalAssessmentAttempts)
        .where(and(eq(finalAssessmentAttempts.assessmentId, assessment[0].id), eq(finalAssessmentAttempts.userId, user.id))),
    ]);
    finalAssessment = {
      id: assessment[0].id,
      title: assessment[0].title,
      passScore: assessment[0].passScore,
      questions,
      bestScore: attempts.length ? Math.max(...attempts.map((attempt) => Number(attempt.score))) : null,
      passed: attempts.some((attempt) => attempt.passed),
    };
  }

  const counts = requirements[0];
  return ok({
    course: { id: course.id, title: course.title, description: course.description, level: course.level, instructor: course.instructor },
    enrolled: !!enrollment || !!legacyPath,
    modules: moduleDetails,
    requirements: {
      lessonsDone: Number(counts.lessons) > 0 && Number(counts.completedLessons) >= Number(counts.lessons),
      lessonsCompleted: Number(counts.completedLessons),
      lessonsTotal: Number(counts.lessons),
      assignmentsDone: Number(counts.assignments) > 0 && Number(counts.passedAssignments) >= Number(counts.assignments),
      assignmentsPassed: Number(counts.passedAssignments),
      assignmentsTotal: Number(counts.assignments),
      finalAssessmentDone: finalAssessment?.passed ?? false,
      certificateCode: certificateRow ?? null,
    },
    finalAssessment,
  });
}
