import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { badges, notifications, streaks, userBadges, users } from "@/db/schema";
import { notificationEmail, sendEmail } from "@/lib/server/mail";

export const levelFromXp = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;

export const XP = { lesson: 40, exerciseCase: 15, exercisePass: 20, placement: 30, review: 50 } as const;

export async function addXp(userId: string, amount: number) {
  await db.update(users).set({ xp: sql`${users.xp} + ${amount}` }).where(eq(users.id, userId));
  const [u] = await db.select({ xp: users.xp }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error(`User ${userId} disappeared while awarding XP.`);
  const level = levelFromXp(u.xp);
  await db.update(users).set({ level }).where(eq(users.id, userId));
  return { xp: u.xp, level };
}

export type Awarded = { code: string; name: string; description: string; icon: string; accent: string; xpReward: number } | null;

export async function awardBadge(userId: string, code: string): Promise<Awarded> {
  const [badge] = await db.select().from(badges).where(eq(badges.code, code)).limit(1);
  if (!badge) return null;
  const [existing] = await db.select().from(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badge.id))).limit(1);
  if (existing) return null;
  await db.insert(userBadges).values({ userId: userId, badgeId: badge.id });
  if (badge.xpReward > 0) await addXp(userId, badge.xpReward);
  await notify(userId, "badge", `Badge earned: ${badge.name}`, badge.description);
  return badge;
}

export async function touchStreak(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const [row] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  if (!row) {
    await db.insert(streaks).values({ userId, current: 1, longest: 1, lastActivityDate: today });
    return { current: 1, longest: 1 };
  }
  if (row.lastActivityDate === today) return { current: row.current, longest: row.longest };
  const current = row.lastActivityDate === yesterday ? row.current + 1 : 1;
  const longest = Math.max(current, row.longest);
  await db.update(streaks).set({ current, longest, lastActivityDate: today }).where(eq(streaks.userId, userId));
  const earned: Awarded[] = [];
  if (current >= 3) earned.push(await awardBadge(userId, "streak-3"));
  if (current >= 7) earned.push(await awardBadge(userId, "streak-7"));
  return { current, longest, earned: earned.filter(Boolean) };
}

export async function notify(userId: string, type: string, title: string, body: string) {
  await db.insert(notifications).values({ userId, type, title, body });
  const [user] = await db.select({ email: users.email, emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`Cannot deliver notification: user ${userId} was not found.`);
  if (user.emailVerified && !await sendEmail(user.email, title, notificationEmail(title, body))) {
    console.error(`Notification email delivery failed for user ${userId}.`);
  }
}
