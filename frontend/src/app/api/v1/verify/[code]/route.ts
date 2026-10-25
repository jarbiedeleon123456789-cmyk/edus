import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, courses, users } from "@/db/schema";
import { fail, ok } from "@/lib/server/api";

// Public endpoint — no auth. This is the page a QR code on a certificate points to.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.trim().toUpperCase();
  const [row] = await db.select({
    code: certificates.code, issuedAt: certificates.issuedAt,
    holder: users.name, course: courses.title, level: courses.level,
  }).from(certificates)
    .innerJoin(users, eq(certificates.userId, users.id))
    .innerJoin(courses, eq(certificates.courseId, courses.id))
    .where(eq(certificates.code, clean))
    .limit(1);

  if (!row) return fail("No credential matches this code. Check the letters and try again.", 404);
  return ok({ ...row, valid: true }, "Credential verified.");
}
