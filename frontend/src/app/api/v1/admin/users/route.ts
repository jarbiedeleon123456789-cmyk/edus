import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, ok, parseBody } from "@/lib/server/api";
import { requireRole } from "@/lib/server/auth";

export async function GET(req: Request) {
  const user = await requireRole(req, ["admin"]);
  if (user instanceof NextResponse) return user;
  const rows = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, active: users.active,
    xp: users.xp, level: users.level, createdAt: users.createdAt,
  }).from(users).orderBy(sql`case ${users.role} when 'admin' then 0 when 'instructor' then 1 else 2 end`, desc(users.xp));

  const counts = await db.select({ role: users.role, count: sql<number>`count(*)` }).from(users).groupBy(users.role).orderBy(asc(users.role));
  return ok({ rows, counts });
}

const patchSchema = z.object({ id: z.string().uuid(), active: z.boolean() });

export async function PATCH(req: Request) {
  const user = await requireRole(req, ["admin"]);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, patchSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.id === user.id) return fail("You can't deactivate your own account.", 409);
  await db.update(users).set({ active: parsed.data.active }).where(eq(users.id, parsed.data.id));
  return ok(null, parsed.data.active ? "Account reactivated." : "Account deactivated.");
}
