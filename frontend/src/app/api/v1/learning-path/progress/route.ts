import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { addXp, awardBadge, touchStreak, XP } from "@/lib/server/gamify";
import { completePathItem } from "@/lib/server/pathgen";

const schema = z.object({
  itemId: z.string().uuid(),
  timeSpentSec: z.number().int().min(0).max(86400).default(0),
});

export async function POST(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;

  const result = await completePathItem(parsed.data.itemId, user.id);
  if ("error" in result) return fail(result.error, result.status);

  const { xp, level } = await addXp(user.id, XP.lesson);
  const streak = await touchStreak(user.id);
  const badges = [];
  badges.push(await awardBadge(user.id, "first-steps"));
  if (result.completed) badges.push(await awardBadge(user.id, "constellation"));

  return ok({
    completed: result.completed,
    certificateCode: "certificateCode" in result ? result.certificateCode : null,
    xp, level, streak, badges: badges.filter(Boolean),
  }, result.completed
    ? (result.certificateCode ? "Path complete — certificate issued." : "Path complete. Finish the course assignments and final assessment to earn your certificate.")
    : "Lesson complete. Next item unlocked.");
}
