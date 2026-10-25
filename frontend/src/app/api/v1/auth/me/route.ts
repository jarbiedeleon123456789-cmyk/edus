import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, streaks } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { publicUser, requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const [streak] = await db.select().from(streaks).where(eq(streaks.userId, user.id)).limit(1);
  const unread = await db.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))).limit(50);
  return ok({
    user: publicUser(user),
    streak: { current: streak?.current ?? 0, longest: streak?.longest ?? 0 },
    unreadNotifications: unread.length,
  });
}
