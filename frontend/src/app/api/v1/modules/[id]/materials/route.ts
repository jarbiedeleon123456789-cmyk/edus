import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, courses, modules } from "@/db/schema";
import { fail, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;
const TYPES: Record<string, Set<string>> = {
  ".pdf": new Set(["application/pdf"]),
  ".ppt": new Set(["application/vnd.ms-powerpoint"]),
  ".pptx": new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
  ".doc": new Set(["application/msword"]),
  ".docx": new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  ".xls": new Set(["application/vnd.ms-excel"]),
  ".xlsx": new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  ".csv": new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]),
  ".txt": new Set(["text/plain"]),
  ".md": new Set(["text/markdown", "text/plain"]),
  ".png": new Set(["image/png"]),
  ".jpg": new Set(["image/jpeg"]),
  ".jpeg": new Set(["image/jpeg"]),
  ".webp": new Set(["image/webp"]),
  ".gif": new Set(["image/gif"]),
  ".zip": new Set(["application/zip", "application/x-zip-compressed"]),
};

const storageRoot = join(process.cwd(), ".data", "course-materials");

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const instructor = await requireRole(req, ["instructor"]);
  if (instructor instanceof NextResponse) return instructor;
  const { id: moduleId } = await params;

  const [row] = await db.select({ courseId: modules.courseId })
    .from(modules)
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(eq(modules.id, moduleId), eq(courses.instructorId, instructor.id)))
    .limit(1);
  if (!row) return fail("Module not found in a course you teach.", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload must be a multipart form containing one file.", 400);
  }

  const part = form.get("file");
  if (!(part instanceof File)) return fail("Choose a file to upload.", 422);
  if (part.size < 1 || part.size > MAX_BYTES) return fail("Files must be between 1 byte and 25 MB.", 413);

  const extension = part.name.slice(part.name.lastIndexOf(".")).toLowerCase();
  const acceptedTypes = TYPES[extension];
  if (!acceptedTypes?.has(part.type.toLowerCase())) {
    return fail("Unsupported file type. Upload PDF, PowerPoint, Word, Excel, CSV, text, image, or ZIP files.", 415);
  }

  const storageKey = randomUUID();
  const bytes = Buffer.from(await part.arrayBuffer());
  await mkdir(storageRoot, { recursive: true });
  await writeFile(join(storageRoot, storageKey), bytes, { flag: "wx" });

  const materialId = randomUUID();
  const name = part.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || `material${extension}`;
  try {
    await db.insert(courseMaterials).values({
      id: materialId,
      courseId: row.courseId,
      moduleId,
      uploadedBy: instructor.id,
      name,
      storageKey,
      contentType: part.type.toLowerCase(),
      bytes: part.size,
    });
  } catch (error) {
    try {
      await unlink(join(storageRoot, storageKey));
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Course material record creation and file cleanup both failed.");
    }
    throw error;
  }

  return ok({ id: materialId, name, bytes: part.size, contentType: part.type }, "Course material uploaded.", 201);
}
