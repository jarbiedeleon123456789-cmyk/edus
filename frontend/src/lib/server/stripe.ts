import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { payments } from "@/db/schema";

const PLANS = {
  pro: { name: "EduSphere Pro (monthly)", amountCents: 1200 },
  team: { name: "EduSphere Team seat (monthly)", amountCents: 800 },
} as const;

export type PlanKey = keyof typeof PLANS;

// Stripe test-mode checkout when STRIPE_SECRET_KEY is set; otherwise a recorded demo payment.
// The browser can then upgrade, downgrade, and inspect payments without real keys.
export async function createCheckout(userId: string, plan: PlanKey, baseUrl: string) {
  const p = PLANS[plan];
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const paymentId = randomUUID();
    await db.insert(payments).values({ id: paymentId, userId, amountCents: p.amountCents, status: "demo" });
    return { demo: true as const, paymentId, url: `${baseUrl}/billing?demo=1&plan=${plan}` };
  }
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${baseUrl}/billing?paid=1`,
    cancel_url: `${baseUrl}/billing`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(p.amountCents),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": p.name,
    "metadata[userId]": userId,
    "metadata[plan]": plan,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? "Stripe error");
  return { demo: false as const, url: json.url };
}
