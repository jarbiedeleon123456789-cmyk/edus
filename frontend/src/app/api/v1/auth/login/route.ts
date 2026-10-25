import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { issueRefresh, publicUser, signAccess } from "@/lib/server/auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export async function POST(req: Request) {
  // Brute-force guard: 10 attempts per 5 minutes per IP.
  if (!rateLimit(`login:${clientIp(req)}`, 10, 5 * 60e3)) {
    return fail("Too many sign-in attempts. Try again in 5 minutes.", 429);
  }
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid || !user.active) return fail("Wrong email or password.", 401);
  if (!user.emailVerified) return fail("Verify your email before signing in. You can request a new verification code from the verification page.", 403);

  return ok({
    user: publicUser(user),
    access: await signAccess(user),
    refresh: await issueRefresh(user.id),
  }, "Signed in.");
}
