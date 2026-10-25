import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { sendVerificationCode } from "@/lib/server/email-verification";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email.").max(190) });
const genericResponse = () => ok(null, "If that account needs verification, a new code has been sent.");

export async function POST(req: Request) {
  if (!rateLimit(`resend-verification:${clientIp(req)}`, 5, 10 * 60_000)) {
    return fail("Too many requests. Try again later.", 429);
  }

  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || user.emailVerified || !user.active) return genericResponse();

  if (!await sendVerificationCode(user.id, user.email)) {
    return fail("We couldn't send the verification email. Check the email service configuration and try again.", 503);
  }
  return genericResponse();
}
