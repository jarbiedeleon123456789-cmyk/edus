import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { streaks, users } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const rows = await db.select({
    id: users.id, name: users.name, xp: users.xp, level: users.level,
    streak: sql<number>`coalesce(${streaks.current}, 0)`.as("streak"),
  }).from(users)
    .leftJoin(streaks, eq(streaks.userId, users.id))
    .where(eq(users.role, "student"))
    .orderBy(desc(users.xp))
    .limit(25);

  const meIndex = rows.findIndex((r) => r.id === user.id);
  return ok({ rows, meRank: meIndex >= 0 ? meIndex + 1 : null });
}
