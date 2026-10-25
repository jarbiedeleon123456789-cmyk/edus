import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  codingAssignmentAttempts, codingAssignments, codingExercises, courseEnrollments, executionResults,
  learningPaths, studentSkillScores, submissions, testCases,
} from "@/db/schema";
import { fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { isLanguageRunnable, runCode, runProgram } from "@/lib/server/executor";
import { addXp, awardBadge, touchStreak, XP } from "@/lib/server/gamify";
import { issueCourseCertificate } from "@/lib/server/course-certification";

const schema = z.object({
  code: z.string().min(1, "Nothing to run yet.").max(50_000),
  input: z.string().max(10_000).default(""),
  language: z.enum(["javascript", "python", "c", "cpp", "csharp", "html"]).default("javascript"),
  exerciseId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  submit: z.boolean().default(false),
});

// Execution endpoint: rate-limited, sandboxed, and the only place code runs.
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!rateLimit(`run:${user.id}`, 30, 60e3)) return fail("Slow down — you can run code 30 times per minute.", 429);

  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { code, input, language, exerciseId, assignmentId, submit } = parsed.data;

  let assignment: typeof codingAssignments.$inferSelect | undefined;
  if (assignmentId) {
    if (user.role !== "student" || !submit || !exerciseId) {
      return fail("Only students can submit code to a coding assignment.", 403);
    }
    [assignment] = await db.select().from(codingAssignments)
      .where(and(eq(codingAssignments.id, assignmentId), eq(codingAssignments.published, true))).limit(1);
    if (!assignment || assignment.exerciseId !== exerciseId) return fail("Assignment not found.", 404);
    const [enrollment] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
      .where(and(eq(courseEnrollments.userId, user.id), eq(courseEnrollments.courseId, assignment.courseId))).limit(1);
    const [legacyPath] = !enrollment
      ? await db.select({ id: learningPaths.id }).from(learningPaths)
        .where(and(eq(learningPaths.userId, user.id), eq(learningPaths.courseId, assignment.courseId))).limit(1)
      : [null];
    if (!enrollment && !legacyPath) return fail("You are not enrolled in this assignment's course.", 403);
  }

  let tests: { input: string; expected: string; hidden: boolean }[] = [];
  let exercise = null;
  if (exerciseId) {
    [exercise] = await db.select().from(codingExercises).where(eq(codingExercises.id, exerciseId)).limit(1);
    if (!exercise) return fail("Exercise not found.", 404);
    tests = await db.select({ input: testCases.input, expected: testCases.expected, hidden: testCases.hidden })
      .from(testCases).where(eq(testCases.exerciseId, exerciseId)).orderBy(asc(testCases.position));
  }

  const executionLanguage = exercise?.language ?? language;
  if (executionLanguage === "html") return fail("HTML exercises run in the browser preview instead.", 422);
  if (!isLanguageRunnable(executionLanguage)) {
    return fail(`The ${executionLanguage} runner is not configured. Add JUDGE0_URL for your private Judge0 instance to enable it.`, 503);
  }
  const freeRun = !exerciseId;
  const result = freeRun
    ? await runProgram(code, executionLanguage, input)
    : await runCode(code, executionLanguage, tests);

  const savedId = randomUUID();
  await db.insert(executionResults).values({
    id: savedId,
    userId: user.id, exerciseId: exerciseId ?? null,
    stdout: result.stdout, stderr: result.stderr, runtimeMs: result.runtimeMs,
    passedCount: result.passedCount, totalCount: result.totalCount, results: result.results,
  });

  let assignmentAttempt: { id: string; score: number; isLate: boolean; certificateCode: string | null } | null = null;
  if (assignment) {
    const attemptId = randomUUID();
    const score = result.totalCount ? Math.round((result.passedCount / result.totalCount) * 10_000) / 100 : 0;
    const isLate = assignment.dueAt !== null && Date.now() > assignment.dueAt.getTime();
    await db.insert(codingAssignmentAttempts).values({
      id: attemptId,
      assignmentId: assignment.id,
      userId: user.id,
      executionResultId: savedId,
      code,
      passedCount: result.passedCount,
      totalCount: result.totalCount,
      score: String(score),
      isLate,
    });
    assignmentAttempt = {
      id: attemptId,
      score,
      isLate,
      certificateCode: score >= 100 ? await issueCourseCertificate(user.id, assignment.courseId) : null,
    };
  }

  // XP only when the student beats their previous best on this exercise, so re-running can't farm it.
  let xpGained = 0;
  const earnedBadges = [];
  if (exercise && result.totalCount > 0) {
    const prior = await db.select({ passed: executionResults.passedCount }).from(executionResults)
      .where(and(eq(executionResults.userId, user.id), eq(executionResults.exerciseId, exercise.id)));
    const priorBest = Math.max(0, ...prior.slice(0, -1).map((r) => r.passed));
    xpGained = Math.max(0, result.passedCount - priorBest) * XP.exerciseCase;
    if (result.passedCount === result.totalCount && priorBest < result.totalCount) {
      xpGained += XP.exercisePass;
      earnedBadges.push(await awardBadge(user.id, "bug-hunter"));
    }
    if (xpGained > 0) await addXp(user.id, xpGained);
    await touchStreak(user.id);
    if (exercise.skillId) {
      await db.insert(studentSkillScores).values({
        userId: user.id, skillId: exercise.skillId, source: "exercise",
        score: String(Math.round((result.passedCount / result.totalCount) * 100)),
      });
    }
  }

  let submissionId: string | null = null;
  if (submit && !assignment && exercise) {
    submissionId = randomUUID();
    await db.insert(submissions).values({
      id: submissionId,
      userId: user.id, exerciseId: exerciseId ?? null, kind: "exercise", code, language: exercise?.language ?? language,
    });
  }

  const clientResults = result.results.map((caseResult) => caseResult.hidden
    ? { ...caseResult, input: "", expected: "", actual: caseResult.passed ? "Passed" : "Hidden test failed", log: [] }
    : caseResult);

  return ok({
    submissionId,
    assignmentAttempt,
    ...result,
    results: clientResults,
    xpGained,
    badges: earnedBadges.filter(Boolean),
  }, assignment ? "Assignment submitted." : "Ran.");
}
