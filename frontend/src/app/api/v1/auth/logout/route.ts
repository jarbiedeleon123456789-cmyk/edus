import { z } from "zod";
import { createHash } from "crypto";
import { jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { refreshTokens } from "@/db/schema";
import { ok, parseBody } from "@/lib/server/api";

const schema = z.object({ refresh: z.string().min(10) });

// Revokes the given refresh token so it can't be rotated again.
export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error; // invalid body still counts as logged out client-side
  try {
    const { payload } = await jwtVerify(parsed.data.refresh, new TextEncoder().encode(process.env.JWT_SECRET ?? "edusphere-dev-secret"), { clockTolerance: "30d" });
    if (payload.sub && payload.jti) {
      const tokenHash = createHash("sha256").update(payload.jti).digest("hex");
      await db.update(refreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, payload.sub), eq(refreshTokens.tokenHash, tokenHash)));
    }
  } catch {
    // token already unusable — nothing to revoke
  }
  return ok(null, "Signed out.");
}
