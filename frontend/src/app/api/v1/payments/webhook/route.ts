import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, subscriptions } from "@/db/schema";
import { ok } from "@/lib/server/api";

// Stripe webhook. Verifies the signature when STRIPE_WEBHOOK_SECRET exists;
// without it the endpoint accepts and no-ops so the demo build never errors out.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret) return ok({ mode: "demo" }, "Webhook received (demo mode).");

  const sig = req.headers.get("stripe-signature") ?? "";
  const signed = sig.split(",").find((p) => p.startsWith("v1="))?.slice(3) ?? "";
  const expected = createHmac("sha256", secret)
    .update(`${sig.split(",").find((p) => p.startsWith("t="))?.slice(2) ?? ""}.${raw}`)
    .digest("hex");
  if (!signed || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) {
    return ok({ mode: "ignored" }, "Bad signature.");
  }

  const event = JSON.parse(raw) as { type: string; data: { object: { metadata?: { userId?: string; plan?: string }; id?: string; amount_total?: number } } };
  const meta = event.data?.object?.metadata ?? {};
  if (event.type === "checkout.session.completed" && meta.userId && meta.plan) {
    await db.insert(payments).values({
      userId: meta.userId, amountCents: event.data.object.amount_total ?? 0,
      stripeSessionId: event.data.object.id, status: "paid",
    });
    await db.update(subscriptions).set({ plan: meta.plan, stripeSubId: event.data.object.id ?? null })
      .where(eq(subscriptions.userId, meta.userId));
  }
  return ok({ mode: "live" }, "Processed.");
}
