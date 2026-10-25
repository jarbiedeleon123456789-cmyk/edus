"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { Check, CreditCard, Info } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/store";

const PLANS = [
  { key: "pro", name: "Pro", price: "$12/mo", items: ["Hidden tests revealed after pass", "Certificate codes for every course", "Priority peer-review matching"] },
  { key: "team", name: "Team", price: "$8/seat/mo", items: ["Instructor dashboards", "Cohort leaderboards", "Live session scheduling"], min: "3 seats" },
];

function BillingInner() {
  const { user } = useAuth();
  const search = useSearchParams();
  const paidDemo = search.get("demo") === "1";

  const checkout = async (plan: string) => {
    const res = await api.post<{ url: string; demo: boolean }>("/api/v1/payments/checkout", { plan });
    if (!res.success) { toast.err(res.message); return; }
    if (res.data.demo) {
      toast.ok("Demo checkout: payment recorded as a test. No card involved.");
    }
    window.location.assign(res.data.url);
  };

  return (
    <div>
      <PageHeader title="Billing" sub="Checkout runs through Stripe. No keys are configured in this deployment, so sessions complete as recorded test payments — upgrade and downgrade as much as you like." />

      {paidDemo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4 mb-6 flex items-center gap-3 border-mint/40">
          <Check size={17} className="text-mint" />
          <p className="text-sm">Demo payment recorded for account <span className="font-mono text-xs">{user?.email}</span>. In production, Stripe&apos;s webhook flips the subscription row here.</p>
        </motion.div>
      )}

      <div className="card p-5 mb-6 flex items-start gap-3">
        <Info size={16} className="text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted leading-relaxed">
          Current plan: <span className="text-text font-semibold">Free</span>. The free plan already includes the placement, adaptive path, playground, peer review, leaderboards, and public verification — paid tiers flip convenience flags, never block learning content.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 max-w-2xl">
        {PLANS.map((p, i) => (
          <motion.div key={p.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="card p-6 flex flex-col">
            <p className="eyebrow">{p.name}</p>
            <p className="display text-3xl font-extrabold mt-2">{p.price}</p>
            <ul className="space-y-2 mt-5 flex-1">
              {p.items.map((it) => <li key={it} className="flex gap-2 text-sm text-muted"><Check size={14} className="text-mint shrink-0 mt-0.5" />{it}</li>)}
            </ul>
            <button className="btn btn-primary mt-6" onClick={() => checkout(p.key)}>
              <CreditCard size={15} /> Checkout {p.name}
            </button>
            <p className="font-mono text-[10px] text-muted mt-2.5 text-center">stripe test mode · decline-safe</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return <Suspense><BillingInner /></Suspense>;
}
