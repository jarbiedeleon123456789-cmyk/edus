import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseEnrollments, courses, learningPaths, lessonSkills, lessons, modules, progressRecords, skills } from "@/db/schema";
import { fail, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const [row] = await db.select({
    id: lessons.id, title: lessons.title, content: lessons.content, estimatedMinutes: lessons.estimatedMinutes,
    moduleTitle: modules.title, courseTitle: courses.title, courseId: courses.id,
    coursePublished: courses.published, instructorId: courses.instructorId,
  }).from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, id)).limit(1);
  if (!row) return fail("Lesson not found.", 404);
  if (user.role === "student" && !row.coursePublished) return fail("Lesson not found.", 404);
  const [enrollment] = user.role === "student"
    ? await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, row.courseId), eq(courseEnrollments.userId, user.id))).limit(1)
    : [null];
  const [path] = user.role === "student" && !enrollment
    ? await db.select({ id: learningPaths.id }).from(learningPaths)
      .where(and(eq(learningPaths.courseId, row.courseId), eq(learningPaths.userId, user.id))).limit(1)
    : [null];
  if (user.role === "student" && !enrollment && !path) return fail("Enroll in this course to view its lessons.", 403);
  if (user.role === "instructor" && row.instructorId !== user.id) {
    return fail("Lesson not found in a course you teach.", 404);
  }

  const skillRows = await db.select({ name: skills.name }).from(lessonSkills)
    .innerJoin(skills, eq(lessonSkills.skillId, skills.id))
    .where(eq(lessonSkills.lessonId, id));

  const [progress] = await db.select().from(progressRecords)
    .where(and(eq(progressRecords.userId, user.id), eq(progressRecords.lessonId, id))).limit(1);

  return ok({ ...row, skills: skillRows.map((s) => s.name), completed: !!progress });
}
