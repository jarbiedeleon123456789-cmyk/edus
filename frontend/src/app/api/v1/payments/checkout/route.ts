import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, parseBody } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { createCheckout } from "@/lib/server/stripe";

const schema = z.object({ plan: z.enum(["pro", "team"]) });

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;

  const baseUrl = new URL(req.url).origin;
  const checkout = await createCheckout(user.id, parsed.data.plan, baseUrl);
  return ok(checkout, checkout.demo ? "Demo checkout — no Stripe key configured, payment recorded as test." : "Redirecting to Stripe.");
}
