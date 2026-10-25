import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseEnrollments, courses, learningPaths, lessons, modules, progressRecords } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { issueCourseCertificate } from "@/lib/server/course-certification";
import { addXp, touchStreak, XP } from "@/lib/server/gamify";

const schema = z.object({ courseId: z.string().uuid(), lessonId: z.string().uuid(), timeSpentSec: z.number().int().min(0).max(86400).default(0) });

export async function POST(req: Request) {
  const student = await requireRole(req, ["student"]);
  if (student instanceof NextResponse) return student;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { courseId, lessonId, timeSpentSec } = parsed.data;
  const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, student.id))).limit(1);
  const [legacyPath] = !enrollment
    ? await db.select({ id: learningPaths.id }).from(learningPaths)
      .where(and(eq(learningPaths.courseId, courseId), eq(learningPaths.userId, student.id))).limit(1)
    : [null];
  if (!enrollment && !legacyPath) return fail("Enroll in this course to record lesson progress.", 403);

  const [lesson] = await db.select({ id: lessons.id }).from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(lessons.id, lessonId), eq(courses.id, courseId), eq(courses.published, true))).limit(1);
  if (!lesson) return fail("Lesson not found in this course.", 404);

  const [existing] = await db.select({ id: progressRecords.id }).from(progressRecords)
    .where(and(eq(progressRecords.userId, student.id), eq(progressRecords.lessonId, lessonId))).limit(1);
  if (existing) return fail("This lesson is already complete.", 409);

  await db.insert(progressRecords).values({ id: randomUUID(), userId: student.id, lessonId, timeSpentSec });
  const { xp, level } = await addXp(student.id, XP.lesson);
  const streak = await touchStreak(student.id);
  const certificateCode = await issueCourseCertificate(student.id, courseId);
  return ok({ completed: true, xp, level, streak, certificateCode },
    certificateCode ? "Lesson complete. Course certificate issued." : "Lesson complete.");
}
