import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseEnrollments, courses } from "@/db/schema";
import { fail, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const student = await requireRole(req, ["student"]);
  if (student instanceof NextResponse) return student;
  const { id: courseId } = await params;
  const [course] = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.published, true))).limit(1);
  if (!course) return fail("Published course not found.", 404);

  await db.insert(courseEnrollments).values({ id: randomUUID(), courseId, userId: student.id })
    .onDuplicateKeyUpdate({ set: { courseId } });
  return ok({ enrolled: true }, "You're enrolled in this course.");
}
