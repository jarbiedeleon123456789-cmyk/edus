import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { files } from "@/db/schema";
import { ok, parseBody } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(100),
  bytes: z.number().int().min(1).max(25 * 1024 * 1024, "Files are capped at 25 MB."),
});

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/markdown"]);

// Pre-signed uploads. With S3/R2 env vars present this would sign against the bucket;
// the demo records the file metadata and returns a no-op URL.
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { name, contentType, bytes } = parsed.data;
  if (!ALLOWED.has(contentType)) return ok({ accepted: false, reason: `${contentType} isn't accepted. Use PNG, JPEG, WebP, PDF, or text.` }, "Type rejected.");

  const key = `u/${user.id.slice(0, 8)}/${Date.now()}-${name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
  await db.insert(files).values({ userId: user.id, key, bytes, contentType });
  return ok({ accepted: true, key, url: null, demo: true }, "File registered. Object storage isn't configured in this demo, so nothing was uploaded.");
}
