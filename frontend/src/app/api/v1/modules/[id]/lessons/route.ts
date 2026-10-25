import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

const schema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(10).max(500_000),
  estimatedMinutes: z.number().int().min(1).max(600).default(20),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id: moduleId } = await params;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const [row] = await db.select({ courseId: modules.courseId }).from(modules)
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(modules.id, moduleId), eq(courses.instructorId, instructor.id))).limit(1);
  if (!row) return fail("Module not found in a course you teach.", 404);

  const [last] = await db.select({ position: sql<number>`coalesce(max(${lessons.position}), -1)` })
    .from(lessons).where(eq(lessons.moduleId, moduleId));
  const id = randomUUID();
  await db.insert(lessons).values({
    id, moduleId, title: parsed.data.title, content: parsed.data.content,
    estimatedMinutes: parsed.data.estimatedMinutes, position: Number(last.position) + 1,
  });
  return ok({ id, title: parsed.data.title }, "Lesson added.", 201);
}
