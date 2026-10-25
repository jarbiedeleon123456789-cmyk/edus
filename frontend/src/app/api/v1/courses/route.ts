import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseEnrollments, courses, learningPathItems, learningPaths, lessons, modules, progressRecords, users } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole, requireUser } from "@/lib/server/auth";

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
});

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const rows = await db.select({
    id: courses.id, title: courses.title, slug: courses.slug, description: courses.description,
    level: courses.level, accent: courses.accent, published: courses.published, instructor: users.name,
    enrolled: sql<boolean>`exists (
      select 1 from ${courseEnrollments} ce
      where ce.course_id = ${courses.id} and ce.user_id = ${user.id}
    ) or exists (
      select 1 from ${learningPaths} lp where lp.course_id = ${courses.id} and lp.user_id = ${user.id}
    )`.as("enrolled"),
    lessonCount: sql<number>`(select count(*) from ${lessons} l join ${modules} m on m.id = l.module_id where m.course_id = ${courses.id})`.as("lesson_count"),
    completedLessons: sql<number>`(
      select count(*) from ${lessons} l
      join ${modules} m on m.id = l.module_id
      where m.course_id = ${courses.id} and (
        exists (select 1 from ${progressRecords} pr where pr.lesson_id = l.id and pr.user_id = ${user.id})
        or exists (
          select 1 from ${learningPathItems} lpi join ${learningPaths} lp on lp.id = lpi.path_id
          where lpi.lesson_id = l.id and lpi.status = 'done' and lp.user_id = ${user.id}
        )
      )
    )`.as("completed_lessons"),
  }).from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .where(user.role === "instructor" ? eq(courses.instructorId, user.id) : eq(courses.published, true))
    .orderBy(asc(courses.createdAt));
  return ok(rows.map((row) => ({ ...row, enrolled: Boolean(row.enrolled) })));
}

export async function POST(req: Request) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const parsed = await parseBody(req, createSchema);
  if ("error" in parsed) return parsed.error;

  const id = randomUUID();
  const baseSlug = parsed.data.title.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "course";
  const slug = `${baseSlug}-${id.slice(0, 8)}`;
  await db.insert(courses).values({
    id,
    instructorId: instructor.id,
    title: parsed.data.title,
    slug,
    description: parsed.data.description,
    level: parsed.data.level,
    published: false,
  });
  return ok({ id, slug, title: parsed.data.title }, "Course created as a draft. Add lessons, course materials, coding assignments, and a final assessment before publishing.", 201);
}
