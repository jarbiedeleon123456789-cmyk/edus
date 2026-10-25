import { createHash, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications } from "@/db/schema";
import { sendEmail, verificationEmail } from "@/lib/server/mail";

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

export async function sendVerificationCode(userId: string, email: string) {
  const code = randomInt(10_000_000, 100_000_000).toString();
  await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  await db.insert(emailVerifications).values({
    userId,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  const sent = await sendEmail(email, "Your EduSphere verification code", verificationEmail(code));
  if (!sent) await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  return sent;
}

export const verificationCodeHash = hashCode;
