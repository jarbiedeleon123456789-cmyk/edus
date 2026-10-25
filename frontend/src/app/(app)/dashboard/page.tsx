"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Flame, PenLine, Play } from "lucide-react";
import { SphereLoader } from "@/components/Logo";
import { CountUp, PageHeader, Ring, SectionTitle, SkillBar, StatCard } from "@/components/ui";
import { Radar } from "@/components/Charts";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/lib/store";
import type { PathNode } from "@/components/Constellation";

type Analytics = {
  xp: number; level: number; nextLevelXp: number;
  streak: { current: number; longest: number };
  mastery: { skill: string; score: number }[];
  path: { done: number; total: number };
  minutesSpent: number; velocity: number; runs: number; badgesCount: number; reviewsGiven: number;
};
type PathData = { path: { rationale: string } | null; items?: PathNode[]; hasPlacement?: boolean };
type QueueItem = { assignmentId: string; status: string };

export default function DashboardPage() {
  const { user } = useAuth();
  const an = useApi<Analytics>("/api/v1/analytics/student");
  const path = useApi<PathData>("/api/v1/learning-path");
  const queue = useApi<QueueItem[]>("/api/v1/peer-review/queue");

  if (an.loading || path.loading) return <SphereLoader label="Loading your dashboard" />;
  const a = an.data;
  if (!a) return <p className="text-muted">Could not load the dashboard: {an.error}</p>;

  const pctToNext = Math.min(100, Math.round((a.xp / a.nextLevelXp) * 100));
  const pendingReviews = (queue.data ?? []).filter((q) => q.status === "pending").length;
  const nextItems = (path.data?.items ?? []).filter((i) => i.status === "current").slice(0, 3);
  const hasPath = !!path.data?.path;
  const gaps = [...a.mastery].sort((x, y) => x.score - y.score).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Back in orbit, ${user?.name.split(" ")[0]}.`}
        sub={hasPath ? (path.data?.path?.rationale ?? "") : "No learning path yet — the placement assessment creates one in about 5 minutes."}
      />

      <div className="card p-4 md:p-5 overflow-hidden relative">
        <div className="glow-blob left-0 top-0 h-28 w-28 bg-primary/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img src={user?.avatar ?? ""} alt={user?.name ?? "Student"} className="h-16 w-16 rounded-full object-cover border border-line" />
            <div>
              <p className="eyebrow">Profile pulse</p>
              <h2 className="display text-2xl font-bold mt-1">{user?.name}</h2>
              <p className="text-muted text-sm">{user?.bio ?? "Building momentum, one lesson at a time."}</p>
            </div>
          </div>
          <Link href="/profile" className="btn btn-ghost !py-2.5">Edit profile</Link>
        </div>
      </div>

      {pendingReviews > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4 flex items-center justify-between gap-4 border-primary/40"
          style={{ background: "linear-gradient(90deg, var(--glow-primary), transparent 65%)" }}>
          <div className="flex items-center gap-3">
            <PenLine size={17} className="text-primary shrink-0" />
            <p className="text-sm"><span className="font-semibold">{pendingReviews} anonymous submission{pendingReviews > 1 ? "s" : ""}</span> waiting for your review. Reviews pay 50 XP.</p>
          </div>
          <Link href="/review" className="btn btn-primary !py-1.5 !px-3.5 text-[13px] shrink-0">Open queue</Link>
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="XP — level" value={<span className="flex items-center gap-3">
          <Ring value={pctToNext} size={54} stroke={6} label={<span className="font-mono text-[11px]">{a.level}</span>} />
          <CountUp value={a.xp} />
        </span>} sub={`${pctToNext}% to level ${a.level + 1}`} />
        <StatCard label="Streak" accent="var(--amber)" value={
          <span className="flex items-center gap-2"><Flame size={24} className="text-amber" fill="currentColor" /><CountUp value={a.streak.current} suffix="d" /></span>
        } sub={`longest ${a.streak.longest} days`} />
        <StatCard label="Path progress" accent="var(--mint)" value={<span>{a.path.done}<span className="text-muted text-base">/{a.path.total}</span></span>} sub={hasPath ? "lessons complete" : "no path yet"} />
        <StatCard label="Avg mastery" accent="var(--coral)" value={<CountUp value={a.mastery.length ? Math.round(a.mastery.reduce((s, m) => s + m.score, 0) / a.mastery.length) : 0} suffix="%" />} sub={`${a.minutesSpent} min studied`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <SectionTitle title="Next on your path" right={hasPath && <Link href="/path" className="text-sm link flex items-center gap-1">Full map <ArrowUpRight size={14} /></Link>} />
          {hasPath && nextItems.length > 0 ? (
            <div className="space-y-3">
              {nextItems.map((n, i) => (
                <motion.div key={n.itemId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="card-raise p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{n.title}</p>
                    <p className="text-muted text-xs font-mono mt-0.5">{n.moduleTitle} · {n.estimatedMinutes} min</p>
                  </div>
                  <Link href={`/lessons/${n.lessonId}?item=${n.itemId}`} className={`btn ${i === 0 ? "btn-primary" : "btn-ghost"} !py-2 !px-3.5 text-[13px] shrink-0`}>
                    <Play size={13} /> {i === 0 ? "Continue" : "Open"}
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : hasPath ? (
            <EmptyPath done />
          ) : (
            <EmptyPath />
          )}
        </div>

        <div className="card p-6">
          <SectionTitle title="Skill constellation" sub="Latest measurement per skill" />
          {a.mastery.length >= 3 ? (
            <Radar data={a.mastery} />
          ) : (
            <p className="text-muted text-sm py-6 text-center">Take the placement to light up the constellation.</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <SectionTitle title="Biggest gaps" sub="Lowest scores first — the path opens with these"
            right={<Link href="/assessment" className="text-sm link">Retake placement</Link>} />
          {gaps.length > 0 ? (
            <div className="space-y-4">
              {gaps.map((g) => <SkillBar key={g.skill} name={g.skill} value={g.score} color={g.score < 40 ? "var(--coral)" : "var(--primary)"} />)}
            </div>
          ) : <p className="text-muted text-sm">No measurements yet.</p>}
        </div>
        <div className="card p-6">
          <SectionTitle title="This week's throughput" sub="Measured, not estimated" />
          <div className="grid grid-cols-2 gap-4 mt-2">
            {[
              { v: a.velocity, suffix: "", label: "lessons / day (14-day pace)", fmt: (v: number) => v.toFixed(1) },
              { v: a.runs, suffix: "", label: "code runs in sandbox", fmt: Math.round },
              { v: a.reviewsGiven, suffix: "", label: "peer reviews submitted", fmt: Math.round },
              { v: a.badgesCount, suffix: "/8", label: "badges earned", fmt: Math.round },
            ].map((s) => (
              <div key={s.label} className="card-raise p-4">
                <p className="display text-2xl font-bold"><CountUp value={typeof s.fmt === "function" && s.fmt !== Math.round ? Math.round(s.v * 10) / 10 : s.fmt(s.v)} suffix={s.suffix} /></p>
                <p className="text-muted text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyPath({ done = false }: { done?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-2xl p-8 text-center">
      <p className="font-medium">{done ? "Path complete." : "No path generated yet."}</p>
      <p className="text-muted text-sm mt-1">{done ? "Everything on it is done. Regenerate for a fresh pass or pick a new course." : "The placement assessment builds one from your skill gaps."}</p>
      <Link href={done ? "/path" : "/assessment"} className="btn btn-primary !py-2 mt-5 inline-flex">
        {done ? "Open path" : <>Take the placement <ArrowRight size={14} /></>}
      </Link>
    </div>
  );
}
