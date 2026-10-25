import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentAttempts, assessmentQuestions, assessments, skills } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

// Returns the placement assessment without answers, plus the student's best prior score.
export async function GET(req: Request) {
  const user = await requireRole(req, ["student", "instructor", "admin"]);
  if (user instanceof NextResponse) return user;

  const [asm] = await db.select().from(assessments).where(eq(assessments.kind, "placement")).limit(1);
  if (!asm) return ok({ assessment: null, questions: [], bestScore: null }, "No placement assessment.");

  const qs = await db.select({
    id: assessmentQuestions.id, type: assessmentQuestions.type, prompt: assessmentQuestions.prompt,
    options: assessmentQuestions.options, points: assessmentQuestions.points, skill: skills.name,
  }).from(assessmentQuestions)
    .leftJoin(skills, eq(assessmentQuestions.skillId, skills.id))
    .where(eq(assessmentQuestions.assessmentId, asm.id))
    .orderBy(asc(assessmentQuestions.position));

  const [best] = await db.select({ score: assessmentAttempts.score })
    .from(assessmentAttempts)
    .where(eq(assessmentAttempts.userId, user.id))
    .orderBy(desc(assessmentAttempts.score)).limit(1);

  return ok({ assessment: { id: asm.id, title: asm.title }, questions: qs, bestScore: best ? Number(best.score) : null });
}
