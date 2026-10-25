import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseEnrollments, courseMaterials, courses, learningPaths } from "@/db/schema";
import { fail } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

const storageRoot = join(process.cwd(), ".data", "course-materials");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const [material] = await db.select({
    id: courseMaterials.id,
    courseId: courseMaterials.courseId,
    name: courseMaterials.name,
    storageKey: courseMaterials.storageKey,
    contentType: courseMaterials.contentType,
    bytes: courseMaterials.bytes,
    instructorId: courses.instructorId,
  }).from(courseMaterials)
    .innerJoin(courses, eq(courseMaterials.courseId, courses.id))
    .where(eq(courseMaterials.id, id))
    .limit(1);
  if (!material) return fail("Course material not found.", 404);

  if (user.role !== "admin" && material.instructorId !== user.id) {
    const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(eq(courseEnrollments.courseId, material.courseId), eq(courseEnrollments.userId, user.id))).limit(1);
    const [legacyPath] = !enrollment
      ? await db.select({ id: learningPaths.id }).from(learningPaths)
        .where(and(eq(learningPaths.courseId, material.courseId), eq(learningPaths.userId, user.id))).limit(1)
      : [null];
    if (!enrollment && !legacyPath) return fail("Enroll in this course to access its materials.", 403);
  }

  let content: Buffer;
  try {
    content = await readFile(join(storageRoot, material.storageKey));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fail("The stored course material is missing. Ask the instructor to upload it again.", 404);
    }
    throw error;
  }

  const filename = encodeURIComponent(material.name).replace(/['()]/g, escape);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": material.contentType,
      "Content-Length": String(material.bytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
