import { createHash, randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { refreshTokens, users } from "@/db/schema";
import { fail } from "./api";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "edusphere-dev-secret");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = typeof users.$inferSelect;

export async function signAccess(user: { id: string; role: string }) {
  return new SignJWT({ role: user.role, typ: "access" })
    .setSubject(user.id)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function issueRefresh(userId: string) {
  const jti = randomUUID();
  const token = await new SignJWT({ typ: "refresh" })
    .setSubject(userId)
    .setJti(jti)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256(jti),
    expiresAt: new Date(Date.now() + 30 * 864e5),
  });
  return token;
}

// Verifies an existing refresh token and rotates it: the old jti is revoked so reuse is detectable.
export async function rotateRefresh(token: string) {
  let sub: string, jti: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "refresh" || !payload.sub || !payload.jti) return null;
    sub = payload.sub;
    jti = payload.jti;
  } catch {
    return null;
  }
  const [row] = await db.select().from(refreshTokens).where(
    and(eq(refreshTokens.userId, sub), eq(refreshTokens.tokenHash, sha256(jti)), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date()))
  ).limit(1);
  if (!row) return null;
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
  if (!user || !user.active) return null;
  return { user, access: await signAccess(user), refresh: await issueRefresh(user.id) };
}

export async function verifyAccess(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "access" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function publicUser(u: SessionUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    xp: u.xp,
    level: u.level,
    avatar: u.avatar,
    bio: u.bio,
  };
}

type AuthHandoff = {
  user: ReturnType<typeof publicUser>;
  access: string;
  refresh: string;
  isNew: boolean;
};

export async function signAuthHandoff(session: AuthHandoff) {
  return new SignJWT({ typ: "google-handoff", session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(secret());
}

export async function verifyAuthHandoff(token: string): Promise<AuthHandoff | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const session = payload.session as AuthHandoff | undefined;
    if (
      payload.typ !== "google-handoff" ||
      !session?.user?.id ||
      !session.access ||
      !session.refresh ||
      typeof session.isNew !== "boolean"
    ) return null;
    return session;
  } catch {
    return null;
  }
}

export async function requireUser(req: Request): Promise<SessionUser | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token ? await verifyAccess(token) : null;
  if (!userId) return fail("Sign in to continue.", 401);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) return fail("Account unavailable.", 401);
  return user;
}

export async function requireRole(req: Request, roles: SessionUser["role"][]): Promise<SessionUser | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!roles.includes(user.role)) return fail("You don't have access to this.", 403);
  return user;
}
