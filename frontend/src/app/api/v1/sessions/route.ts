import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { courses, liveSessions, users } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole, requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const rows = await db.select({
    id: liveSessions.id, title: liveSessions.title, startsAt: liveSessions.startsAt,
    durationMin: liveSessions.durationMin, joinUrl: liveSessions.joinUrl,
    course: courses.title, host: users.name,
  }).from(liveSessions)
    .innerJoin(courses, eq(liveSessions.courseId, courses.id))
    .innerJoin(users, eq(liveSessions.hostId, users.id))
    .where(gte(liveSessions.startsAt, new Date(Date.now() - 36e5)))
    .orderBy(asc(liveSessions.startsAt));
  const now = Date.now();
  return ok(rows.map((row) => {
    const startsAt = row.startsAt.getTime();
    return { ...row, live: startsAt - now < 15 * 60e3 && startsAt + row.durationMin * 60e3 > now };
  }));
}

const createSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(4).max(120),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(240).default(60),
});

// Join links use Jitsi's open rooms — no account or key needed, provider can swap to Zoom via env later.
export async function POST(req: Request) {
  const user = await requireRole(req, ["instructor", "admin"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, createSchema);
  if ("error" in parsed) return parsed.error;

  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, parsed.data.courseId)).limit(1);
  if (!course) return fail("Course not found.", 404);

  const roomCode = "edusphere-" + Math.random().toString(36).slice(2, 10);
  const row = {
    id: randomUUID(),
    courseId: course.id, hostId: user.id, title: parsed.data.title,
    startsAt: new Date(parsed.data.startsAt), durationMin: parsed.data.durationMin,
    roomCode, joinUrl: `https://meet.jit.si/${roomCode}`,
  };
  await db.insert(liveSessions).values(row);
  return ok(row, "Session scheduled.", 201);
}
