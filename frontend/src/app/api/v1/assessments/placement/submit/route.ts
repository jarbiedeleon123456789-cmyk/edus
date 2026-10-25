import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentAttempts, assessmentQuestions, attemptAnswers, skills, studentSkillScores } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { addXp, awardBadge, touchStreak, XP } from "@/lib/server/gamify";
import { generatePath } from "@/lib/server/pathgen";

const schema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    response: z.string().max(4000),
  })).min(1, "Answer at least one question."),
});

// Grades answers, writes per-skill mastery, then re-sequences the learning path around the gaps.
export async function POST(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;

  const questionIds = parsed.data.answers.map((a) => a.questionId);
  const rows = await db.select({
    id: assessmentQuestions.id, skillId: assessmentQuestions.skillId, type: assessmentQuestions.type,
    answer: assessmentQuestions.answer, points: assessmentQuestions.points, prompt: assessmentQuestions.prompt,
    skillName: skills.name, assessmentId: assessmentQuestions.assessmentId,
  }).from(assessmentQuestions)
    .leftJoin(skills, eq(assessmentQuestions.skillId, skills.id));
  const byId = new Map(rows.filter((r) => questionIds.includes(r.id)).map((r) => [r.id, r]));
  if (byId.size === 0) return fail("Unknown questions.", 422);

  const graded = parsed.data.answers.map((a) => {
    const q = byId.get(a.questionId)!;
    const response = a.response.trim();
    const correct = q.type === "mcq"
      ? response === q.answer
      : response.toLowerCase().includes(q.answer.toLowerCase());
    return { q, response, correct, awarded: correct ? q.points : 0 };
  });

  const earned = graded.reduce((a, g) => a + g.awarded, 0);
  const possible = graded.reduce((a, g) => a + g.q.points, 0);
  const scorePct = possible > 0 ? (earned / possible) * 100 : 0;

  const attempt = { id: randomUUID() };
  await db.insert(assessmentAttempts).values({
    id: attempt.id,
    assessmentId: graded[0].q.assessmentId, userId: user.id, status: "submitted",
    score: scorePct.toFixed(2), submittedAt: new Date(),
  });
  await db.insert(attemptAnswers).values(graded.map((g) => ({
    attemptId: attempt.id, questionId: g.q.id, response: g.response, isCorrect: g.correct, pointsAwarded: g.awarded,
  })));

  // Mastery per skill = earned / available for the skill in this attempt.
  const perSkill = new Map<string, { name: string; earned: number; possible: number }>();
  for (const g of graded) {
    const e = perSkill.get(g.q.skillId) ?? { name: g.q.skillName ?? "Skill", earned: 0, possible: 0 };
    e.earned += g.awarded; e.possible += g.q.points;
    perSkill.set(g.q.skillId, e);
  }
  const skillGaps = [...perSkill.entries()].map(([skillId, v]) => ({
    skillId, skill: v.name, score: Math.round((v.earned / v.possible) * 100),
  })).sort((a, b) => a.score - b.score);
  await db.insert(studentSkillScores).values(skillGaps.map((g) => ({
    userId: user.id, skillId: g.skillId, source: "assessment" as const, score: String(g.score),
  })));

  const awarded = [];
  awarded.push(await awardBadge(user.id, "pathfinder"));
  if (scorePct >= 90) awarded.push(await awardBadge(user.id, "sharp-mind"));
  const { xp, level } = await addXp(user.id, XP.placement);
  const streak = await touchStreak(user.id);
  const path = await generatePath(user.id, true);

  return ok({
    scorePct: Math.round(scorePct), earned, possible,
    perQuestion: graded.map((g) => ({
      questionId: g.q.id, prompt: g.q.prompt, response: g.response, correct: g.correct,
      expected: g.q.answer, pointsAwarded: g.awarded, skill: g.q.skillName,
    })),
    skillGaps,
    xp, level, streak,
    badges: awarded.filter(Boolean),
    pathId: path.pathId,
  }, `Scored ${Math.round(scorePct)}%. Your path has been re-sequenced around the gaps.`);
}
