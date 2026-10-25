import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, courses } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const rows = await db.select({
    code: certificates.code, issuedAt: certificates.issuedAt, course: courses.title,
  }).from(certificates)
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(certificates.userId, user.id))
    .orderBy(desc(certificates.issuedAt));
  return ok(rows);
}
