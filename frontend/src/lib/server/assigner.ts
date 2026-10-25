import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { peerAssignments, submissions, users } from "@/db/schema";
import { notify } from "./gamify";

// Assigns a submission to n reviewers: never the author, no duplicates, least-loaded reviewers first.
export async function assignReviewers(submissionId: string, authorId: string, n = 3) {
  const candidates = await db.select({
    id: users.id,
    load: sql<number>`(select count(*) from peer_assignments pa where pa.reviewer_id = ${users.id})`.as("load"),
  }).from(users)
    .where(and(eq(users.role, "student"), eq(users.active, true), ne(users.id, authorId)))
    .orderBy(sql`load asc, rand()`)
    .limit(n + 2); // small cushion in case a unique-constraint retry is needed

  let assigned = 0;
  for (const c of candidates) {
    if (assigned >= n) break;
    try {
      await db.insert(peerAssignments).values({ submissionId, reviewerId: c.id });
      assigned++;
      await notify(c.id, "review_assigned", "A peer submission is waiting for your review", "It was added to your review queue. The author stays anonymous.");
    } catch {
      // duplicate (submissionId, reviewerId) — skip this candidate
    }
  }
  if (assigned > 0) {
    await db.update(submissions).set({ status: "reviewing" }).where(eq(submissions.id, submissionId));
  }
  return assigned;
}
