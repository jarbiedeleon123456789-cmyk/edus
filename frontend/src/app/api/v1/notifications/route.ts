import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ok, parseBody } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const rows = await db.select().from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  const unread = rows.filter((r) => !r.readAt).length;
  return ok({ rows, unread });
}

const patchSchema = z.object({ all: z.boolean().default(true), ids: z.array(z.string().uuid()).optional() });

export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, patchSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.all) {
    await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  }
  return ok(null, "Marked as read.");
}
