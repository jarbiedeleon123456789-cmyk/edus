import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";
import { awardBadge } from "@/lib/server/gamify";
import { activePath, generatePath, pathDetail } from "@/lib/server/pathgen";

export async function POST(req: Request) {
  const user = await requireRole(req, ["student"]);
  if (user instanceof NextResponse) return user;
  try {
    const hadPath = await activePath(user.id);
    const { pathId, created } = await generatePath(user.id, !!hadPath);
    const badge = created ? await awardBadge(user.id, "pathfinder") : null;
    const detail = await pathDetail(pathId);
    return ok({ path: detail?.path, items: detail?.items ?? [], course: detail?.course ?? null, badge },
      hadPath ? "Path regenerated around your latest scores." : "Your path is ready.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not generate a path.", 500);
  }
}
