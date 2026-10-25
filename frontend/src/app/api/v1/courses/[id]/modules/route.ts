import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courses, modules } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

const schema = z.object({ title: z.string().trim().min(2).max(160) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id: courseId } = await params;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const [course] = await db.select({ id: courses.id }).from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.instructorId, instructor.id))).limit(1);
  if (!course) return fail("Course not found in your instructor account.", 404);

  const [last] = await db.select({ position: sql<number>`coalesce(max(${modules.position}), -1)` })
    .from(modules).where(eq(modules.courseId, courseId));
  const id = randomUUID();
  await db.insert(modules).values({ id, courseId, title: parsed.data.title, position: Number(last.position) + 1 });
  return ok({ id, title: parsed.data.title }, "Module added.", 201);
}
