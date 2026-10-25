import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { assessmentAttempts } from "@/db/schema";
import { ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { activePath, pathDetail } from "@/lib/server/pathgen";

export async function GET(req: Request) {
  const user = await requireRole(req, ["student", "instructor", "admin"]);
  if (user instanceof NextResponse) return user;

  const active = await activePath(user.id);
  if (!active) {
    const [attempt] = await db.select().from(assessmentAttempts)
      .where(eq(assessmentAttempts.userId, user.id)).orderBy(desc(assessmentAttempts.submittedAt)).limit(1);
    return ok({ path: null, hasPlacement: !!attempt }, "No active learning path.");
  }
  const detail = await pathDetail(active.id);
  return ok({ path: detail?.path, items: detail?.items ?? [], course: detail?.course ?? null });
}
