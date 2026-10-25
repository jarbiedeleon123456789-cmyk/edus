import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { peerAssignments, progressRecords, skills, streaks, studentSkillScores, submissions, users } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireRole(req, ["instructor", "admin"]);
  if (user instanceof NextResponse) return user;

  const students = await db.select({
    id: users.id, name: users.name, xp: users.xp, level: users.level,
    lessons: sql<number>`(select count(*) from ${progressRecords} pr where pr.user_id = ${users.id})`.as("lessons"),
    reviewsDone: sql<number>`(select count(*) from ${peerAssignments} pa where pa.reviewer_id = ${users.id} and pa.status = 'submitted')`.as("reviews_done"),
    reviewsPending: sql<number>`(select count(*) from ${peerAssignments} pa where pa.reviewer_id = ${users.id} and pa.status = 'pending')`.as("reviews_pending"),
    streak: sql<number>`coalesce((select s.current from ${streaks} s where s.user_id = ${users.id}), 0)`.as("streak"),
    avgMastery: sql<number | null>`(
      select round(avg(m.score), 0)
      from ${studentSkillScores} m
      inner join (
        select skill_id, max(measured_at) as measured_at
        from ${studentSkillScores}
        where user_id = ${users.id}
        group by skill_id
      ) latest on latest.skill_id = m.skill_id and latest.measured_at = m.measured_at
      where m.user_id = ${users.id}
    )`.as("avg_mastery"),
  }).from(users).where(eq(users.role, "student")).orderBy(desc(users.xp));

  // Class-wide average of the latest reading per skill.
  const masteryRows = await db.select({
    skill: skills.name,
    avgScore: sql<number>`round(avg(m.score), 0)`.as("avg_score"),
  }).from(sql`(
      select scores.skill_id, scores.user_id, scores.score
      from student_skill_scores scores
      inner join (
        select skill_id, user_id, max(measured_at) as measured_at
        from student_skill_scores
        group by skill_id, user_id
      ) latest on latest.skill_id = scores.skill_id
        and latest.user_id = scores.user_id
        and latest.measured_at = scores.measured_at
    ) m`)
    .innerJoin(skills, sql`${skills.id} = m.skill_id`)
    .groupBy(skills.name);

  const reviewQueue = await db.select({
    status: submissions.status, count: sql<number>`count(*)`,
  }).from(submissions).where(eq(submissions.kind, "assignment")).groupBy(submissions.status);

  return ok({ students, classMastery: masteryRows, reviewQueue });
}
