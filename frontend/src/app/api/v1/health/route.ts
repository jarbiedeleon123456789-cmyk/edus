import { sql } from "drizzle-orm";
import { db } from "@/db";
import { fail, ok } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return ok({ service: "edusphere", version: "v1", db: "up" }, "Healthy.");
  } catch {
    return fail("Database unreachable.", 503);
  }
}
