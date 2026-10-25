import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, fail, ok, parseBody, rateLimit } from "@/lib/server/api";
import { issueRefresh, publicUser, signAccess, signAuthHandoff, type SessionUser } from "@/lib/server/auth";
import { notify } from "@/lib/server/gamify";

const schema = z.object({
  credential: z.string().min(20, "Google sign-in failed. Try again."),
});

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function POST(req: Request) {
  if (!rateLimit(`google:${clientIp(req)}`, 10, 5 * 60e3)) {
    return fail("Too many Google sign-in attempts. Try again in a few minutes.", 429);
  }

  let credential: string;
  let redirectMode = false;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("Google sign-in sent an invalid form.", 400);
    }

    const formCsrf = form.get("g_csrf_token");
    const csrfCookie = req.headers.get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("g_csrf_token="))
      ?.slice("g_csrf_token=".length);
    if (typeof formCsrf !== "string" || !csrfCookie || formCsrf !== csrfCookie) {
      return fail("Google sign-in security check failed. Please try again.", 403);
    }

    const formCredential = form.get("credential");
    if (typeof formCredential !== "string") return fail("Google did not return a sign-in credential.", 400);
    credential = formCredential;
    redirectMode = true;
  } else {
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    credential = parsed.data.credential;
  }

  const credentialCheck = schema.shape.credential.safeParse(credential);
  if (!credentialCheck.success) return fail("Google sign-in failed. Try again.", 422);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return fail("Google sign-in is not configured yet.", 503);

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(credentialCheck.data, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    payload = verified.payload;
  } catch {
    return fail("Google sign-in failed. Please try again.", 401);
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!email || payload.email_verified !== true || !z.string().email().safeParse(email).success) {
    return fail("Google did not provide a valid verified email address.", 401);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let sessionUser: SessionUser;
  if (existing) {
    if (!existing.active) return fail("This account is unavailable.", 401);
    if (!existing.emailVerified) {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, existing.id));
      existing.emailVerified = true;
    }
    sessionUser = existing;
  } else {
    const name = (typeof payload.name === "string" ? payload.name : email.split("@")[0]).trim().slice(0, 80) || "Google learner";
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    await db.insert(users).values({ id: userId, name, email, passwordHash, role: "student" });

    const [created] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!created) throw new Error("Newly created Google user could not be loaded.");
    sessionUser = created;

    await notify(
      created.id,
      "welcome",
      `You're in, ${name.split(" ")[0]}.`,
      "Google sign-in is active. Start with the placement assessment and build your next learning path."
    );
  }

  const session = {
    user: publicUser(sessionUser),
    access: await signAccess(sessionUser),
    refresh: await issueRefresh(sessionUser.id),
    isNew: !existing,
  };

  if (!redirectMode) {
    const { isNew, ...authSession } = session;
    return ok(authSession, existing ? "Signed in with Google." : "Account created with Google.", isNew ? 201 : 200);
  }

  const handoff = await signAuthHandoff(session);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const response = NextResponse.redirect(new URL("/auth/google/callback", appUrl), 303);
  response.cookies.set("edusphere_google_handoff", handoff, {
    httpOnly: true,
    secure: new URL(appUrl).protocol === "https:",
    sameSite: "lax",
    path: "/api/v1/auth/google/exchange",
    maxAge: 60,
  });
  return response;
}
