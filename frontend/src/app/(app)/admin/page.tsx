"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { SphereLoader } from "@/components/Logo";
import { PageHeader, SectionTitle } from "@/components/ui";
import { toast } from "@/components/Toasts";
import { fmtDate, useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/components/Shell";

type AdminUsers = {
  rows: { id: string; name: string; email: string; role: string; active: boolean; xp: number; level: number; createdAt: string }[];
  counts: { role: string; count: number }[];
};

export default function AdminPage() {
  const { ready } = useRequireAuth("admin");
  const users = useApi<AdminUsers>(ready ? "/api/v1/admin/users" : null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!ready || users.loading) return <SphereLoader label="Loading admin console" />;
  if (!users.data) return <p className="text-muted">{users.error ?? "No data."}</p>;

  const d = users.data;
  const toggle = async (id: string, active: boolean) => {
    setBusyId(id);
    const res = await api.patch("/api/v1/admin/users", { id, active: !active });
    setBusyId(null);
    if (!res.success) { toast.err(res.message); return; }
    toast.ok(res.message);
    void users.refetch();
  };

  return (
    <div>
      <PageHeader title="Admin console" sub="User management for the demo institute. Deactivated accounts can no longer sign in; their data stays put." />

      <div className="grid grid-cols-3 gap-3 mb-8 max-w-lg">
        {d.counts.map((c) => (
          <div key={c.role} className="card p-5">
            <p className="eyebrow">{c.role}s</p>
            <p className="display text-3xl font-bold mt-2 font-mono">{c.count}</p>
          </div>
        ))}
      </div>

      <SectionTitle title="All users" sub={`${d.rows.filter((r) => r.active).length} active of ${d.rows.length} total`} />
      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-muted text-[11px] font-mono border-b border-line">
              <th className="px-5 py-3 font-normal">Name</th>
              <th className="px-3 py-3 font-normal">Email</th>
              <th className="px-3 py-3 font-normal">Role</th>
              <th className="px-3 py-3 font-normal">XP / Level</th>
              <th className="px-3 py-3 font-normal">Joined</th>
              <th className="px-3 py-3 font-normal">Status</th>
              <th className="px-5 py-3 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((u, i) => (
              <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}
                className={`border-b border-line/50 last:border-0 ${!u.active ? "opacity-50" : ""}`}>
                <td className="px-5 py-3 font-medium">{u.name}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted">{u.email}</td>
                <td className="px-3 py-3"><span className="tag">{u.role}</span></td>
                <td className="px-3 py-3 font-mono">{u.xp.toLocaleString()} / {u.level}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted">{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-3">
                  {u.active
                    ? <span className="flex items-center gap-1.5 text-mint text-xs"><UserRoundCheck size={13} /> active</span>
                    : <span className="flex items-center gap-1.5 text-coral text-xs"><UserRoundX size={13} /> deactivated</span>}
                </td>
                <td className="px-5 py-3">
                  <button
                    disabled={busyId === u.id || u.role === "admin"}
                    onClick={() => toggle(u.id, u.active)}
                    className={`btn !py-1 !px-3 text-[12px] ${u.active ? "btn-ghost !text-coral" : "btn-ghost !text-mint"}`}>
                    {busyId === u.id ? "…" : u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 card p-5 flex items-start gap-3">
        <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted leading-relaxed">
          Institutions, platform settings, and payment reconciliation are database-backed in the schema but not wired to a UI in this pass — the seed ships one demo institution and test-mode payment records.
        </p>
      </div>
    </div>
  );
}
