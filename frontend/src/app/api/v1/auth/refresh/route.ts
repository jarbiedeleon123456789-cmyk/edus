import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/server/api";
import { publicUser, rotateRefresh } from "@/lib/server/auth";

const schema = z.object({ refresh: z.string().min(10) });

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const rotated = await rotateRefresh(parsed.data.refresh);
  if (!rotated) return fail("Session expired. Sign in again.", 401);
  return ok({ user: publicUser(rotated.user), access: rotated.access, refresh: rotated.refresh }, "Session renewed.");
}
