import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { sendVerificationCode } from "@/lib/server/email-verification";
import { mailConfigured } from "@/lib/server/mail";

const schema = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters.").max(80),
  email: z.string().trim().toLowerCase().email("That email doesn't look valid.").max(190),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export async function POST(req: Request) {
  if (!rateLimit(`register:${clientIp(req)}`, 10, 10 * 60e3)) {
    return fail("Too many sign-up attempts. Try again in a few minutes.", 429);
  }
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { name, email, password } = parsed.data;
  if (!mailConfigured()) return fail("Email verification is unavailable until the email service is configured.", 503);

  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dupe) return fail("An account with this email already exists.", 409, { email: "Already registered — try signing in." });

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  await db.insert(users).values({ id: userId, name, email, passwordHash, role: "student", emailVerified: false });
  const sent = await sendVerificationCode(userId, email);
  if (!sent) {
    await db.delete(users).where(eq(users.id, userId));
    return fail("We couldn't send a verification email. Check the email service configuration and try again.", 503);
  }
  return ok({ email }, "Check your email for a verification code.", 201);
}
