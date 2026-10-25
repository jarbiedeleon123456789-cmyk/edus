import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { codingAssignmentAttempts, codingAssignments, courses, users } from "@/db/schema";
import { fail, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (user.role !== "instructor" && user.role !== "admin") return fail("Instructor access required.", 403);
  const { id } = await params;
  const [assignment] = await db.select({
    id: codingAssignments.id,
    instructorId: courses.instructorId,
  }).from(codingAssignments)
    .innerJoin(courses, eq(codingAssignments.courseId, courses.id))
    .where(eq(codingAssignments.id, id)).limit(1);
  if (!assignment || (user.role !== "admin" && assignment.instructorId !== user.id)) {
    return fail("Assignment not found in a course you teach.", 404);
  }
  const attempts = await db.select({
    id: codingAssignmentAttempts.id,
    student: users.name,
    score: codingAssignmentAttempts.score,
    passedCount: codingAssignmentAttempts.passedCount,
    totalCount: codingAssignmentAttempts.totalCount,
    isLate: codingAssignmentAttempts.isLate,
    submittedAt: codingAssignmentAttempts.submittedAt,
    code: codingAssignmentAttempts.code,
  }).from(codingAssignmentAttempts)
    .innerJoin(users, eq(codingAssignmentAttempts.userId, users.id))
    .where(eq(codingAssignmentAttempts.assignmentId, id))
    .orderBy(desc(codingAssignmentAttempts.submittedAt))
    .limit(100);
  return ok(attempts);
}
