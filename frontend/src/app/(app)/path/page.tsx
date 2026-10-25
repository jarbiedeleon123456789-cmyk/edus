"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Gauge, Lock, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { SphereLoader } from "@/components/Logo";
import { Constellation, type PathNode } from "@/components/Constellation";
import { PageHeader, SectionTitle, EmptyState } from "@/components/ui";
import { BadgeModal, type EarnedBadge } from "@/components/BadgeModal";
import { toast } from "@/components/Toasts";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";

type PathData = {
  path: { id: string; rationale: string; velocity: string; status: string } | null;
  items: PathNode[];
  course: { title: string; level: string } | null;
  hasPlacement?: boolean;
  badge?: EarnedBadge | null;
};

export default function PathPage() {
  const router = useRouter();
  const pathRes = useApi<PathData>("/api/v1/learning-path");
  const [regenerating, setRegenerating] = useState(false);
  const [badge, setBadge] = useState<EarnedBadge[]>([]);
  const [generating, setGenerating] = useState(false);

  const data = pathRes.data;
  const items = data?.items ?? [];
  const done = items.filter((i) => i.status === "done").length;

  if (pathRes.loading) return <SphereLoader label="Charting your path" />;

  if (!data?.path) {
    return (
      <EmptyState
        icon={<Gauge size={20} />}
        title="No path yet"
        body="The path engine needs your placement scores to sequence lessons around your gaps. Without them it just follows course order — the placement is worth the 5 minutes."
        action={
          <div className="flex gap-2 mt-2">
            <Link href="/assessment" className="btn btn-primary">Take the placement</Link>
            <button className="btn btn-ghost" disabled={generating || !data?.hasPlacement}
              onClick={async () => {
                setGenerating(true);
                const r = await api.post<PathData>("/api/v1/learning-path/generate");
                setGenerating(false);
                if (r.success) { if (r.data.badge) setBadge([r.data.badge]); void pathRes.refetch(); toast.ok(r.message); }
                else toast.err(r.message);
              }}>
              {generating ? "Building…" : "Build without placement"}
            </button>
          </div>
        }
      />
    );
  }

  const regenerate = async () => {
    setRegenerating(true);
    const r = await api.post<{ items: unknown[] }>("/api/v1/learning-path/generate");
    setRegenerating(false);
    if (r.success) { toast.ok("Path re-sequenced with your latest scores."); void pathRes.refetch(); }
    else toast.err(r.message);
  };

  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {badge.length > 0 && <BadgeModal badges={badge} onClose={() => setBadge([])} />}
      <PageHeader
        title={data.course ? `${data.course.title} — your orbit` : "My learning path"}
        sub={data.path.rationale}
        actions={
          <button className="btn btn-ghost" onClick={regenerate} disabled={regenerating}>
            <RefreshCw size={15} className={regenerating ? "animate-spin" : ""} /> {regenerating ? "Re-sequencing…" : "Regenerate"}
          </button>
        }
      />

      <div className="card p-2 md:p-6">
        <Constellation items={items} onOpen={(n) => router.push(`/lessons/${n.lessonId}?item=${n.itemId}`)} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 px-2 pb-2 text-xs text-muted font-mono">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-mint inline-block" /> {done} done</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" /> current</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-raised border border-line inline-block" /> locked</span>
          <span className="ml-auto">{progress}% complete · pace {Number(data.path.velocity).toFixed(1)} lessons/day</span>
        </div>
      </div>

      <div>
        <SectionTitle title="Sequence" sub="Weakest skills first — completed lessons anchored in place" />
        <div className="space-y-2">
          {items.map((n, i) => (
            <motion.div key={n.itemId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className={`card p-4 flex items-center gap-4 ${n.status === "locked" ? "opacity-55" : ""}`}>
              <span className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
                n.status === "done" ? "bg-mint/15 text-mint" : n.status === "current" ? "bg-primary/15 text-primary" : "bg-raised text-muted"}`}>
                {n.status === "done" ? <Check size={15} /> : n.status === "locked" ? <Lock size={13} /> : <Play size={13} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{i + 1}. {n.title}</p>
                <p className="text-muted text-xs font-mono mt-0.5">{n.moduleTitle} · {n.estimatedMinutes} min</p>
              </div>
              {n.status !== "locked" ? (
                <Link href={`/lessons/${n.lessonId}?item=${n.itemId}`} className={`btn ${n.status === "current" ? "btn-primary" : "btn-ghost"} !py-1.5 !px-3.5 text-[13px] shrink-0`}>
                  {n.status === "done" ? "Review" : "Start"}
                </Link>
              ) : (
                <span className="tag">unlocks next</span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
