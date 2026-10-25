import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { clientIp, fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { verificationCodeHash } from "@/lib/server/email-verification";
import { issueRefresh, publicUser, signAccess } from "@/lib/server/auth";
import { notify } from "@/lib/server/gamify";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(190),
  code: z.string().regex(/^\d{8}$/, "Enter the 8-digit code from your email."),
});

export async function POST(req: Request) {
  if (!rateLimit(`verify-email:${clientIp(req)}`, 10, 10 * 60_000)) {
    return fail("Too many verification attempts. Try again later.", 429);
  }

  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { email, code } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.emailVerified || !user.active) {
    return fail("The verification code is invalid or expired.", 422, { code: "Request a new code and try again." });
  }

  const verified = await db.transaction(async (tx) => {
    const [record] = await tx.select().from(emailVerifications).where(and(
      eq(emailVerifications.userId, user.id),
      eq(emailVerifications.codeHash, verificationCodeHash(code)),
      gt(emailVerifications.expiresAt, new Date()),
    )).limit(1);
    if (!record) return false;
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
    await tx.delete(emailVerifications).where(eq(emailVerifications.id, record.id));
    return true;
  });
  if (!verified) {
    return fail("The verification code is invalid or expired.", 422, { code: "Request a new code and try again." });
  }

  const [verifiedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!verifiedUser) throw new Error("Verified user could not be reloaded.");
  await notify(
    verifiedUser.id,
    "welcome",
    `You're in, ${verifiedUser.name.split(" ")[0]}.`,
    "Start with the placement assessment — 10 questions, about 5 minutes. Your learning path is built from the result."
  );
  return ok({
    user: publicUser(verifiedUser),
    access: await signAccess(verifiedUser),
    refresh: await issueRefresh(verifiedUser.id),
  }, "Email verified. Your account is ready.");
}
