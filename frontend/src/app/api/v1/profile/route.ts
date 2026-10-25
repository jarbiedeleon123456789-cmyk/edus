import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { publicUser, requireUser } from "@/lib/server/auth";

const avatarSchema = z.string().max(1_500_000).refine(
  (value) => value.startsWith("data:image/svg+xml;charset=utf-8,") ||
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value),
  "Upload a PNG, JPEG, WEBP, or GIF image."
);

const schema = z.object({
  bio: z.string().trim().max(180, "Bio must be 180 characters or fewer."),
  avatar: avatarSchema,
});

export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;

  await db.update(users).set(parsed.data).where(eq(users.id, user.id));
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile) throw new Error("Updated profile could not be reloaded.");
  return ok({ user: publicUser(profile) }, "Profile saved.");
}
