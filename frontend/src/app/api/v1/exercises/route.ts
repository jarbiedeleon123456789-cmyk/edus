import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { codingExercises, courses, executionResults, skills, testCases } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { isLanguageRunnable } from "@/lib/server/executor";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const rows = await db.select({
    id: codingExercises.id, title: codingExercises.title, prompt: codingExercises.prompt,
    language: codingExercises.language, starterCode: codingExercises.starterCode,
    course: courses.title, skill: skills.name,
    visibleTests: sql<number>`coalesce(sum(case when not ${testCases.hidden} then 1 else 0 end), 0)`.as("visible_tests"),
    totalTests: sql<number>`count(*)`.as("total_tests"),
    bestPassed: sql<number | null>`(
      select max(er.passed_count) from ${executionResults} er
      where er.exercise_id = ${codingExercises.id} and er.user_id = ${user.id}
    )`.as("best_passed"),
  }).from(codingExercises)
    .innerJoin(courses, eq(codingExercises.courseId, courses.id))
    .leftJoin(skills, eq(codingExercises.skillId, skills.id))
    .leftJoin(testCases, and(eq(testCases.exerciseId, codingExercises.id)))
    .groupBy(codingExercises.id, courses.title, skills.name)
    .orderBy(codingExercises.createdAt);
  return ok(rows.map((row) => ({
    ...row,
    runnerAvailable: row.language === "html" || isLanguageRunnable(row.language),
  })));
}
