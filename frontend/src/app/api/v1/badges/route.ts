import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { badges, userBadges } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const mine = await db.select({
    id: badges.id, code: badges.code, name: badges.name, description: badges.description,
    icon: badges.icon, accent: badges.accent, xpReward: badges.xpReward, awardedAt: userBadges.awardedAt,
  }).from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.userId, user.id))
    .orderBy(desc(userBadges.awardedAt));

  const all = await db.select().from(badges);
  const earnedCodes = new Set(mine.map((m) => m.code));

  return ok({
    earned: mine,
    upcoming: all.filter((b) => !earnedCodes.has(b.code))
      .map((b) => ({ code: b.code, name: b.name, description: b.description, icon: b.icon, accent: b.accent })),
  });
}
