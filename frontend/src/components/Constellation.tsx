"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";

export type PathNode = {
  itemId: string; lessonId: string; title: string; moduleTitle: string;
  estimatedMinutes: number; status: "locked" | "current" | "done" | "skipped"; position: number;
};

// The learning path as a constellation: alternating nodes along a sine spine, lines draw
// between neighbors, completed nodes glow, the active node pulses.
export function Constellation({ items, onOpen }: { items: PathNode[]; onOpen: (n: PathNode) => void }) {
  const W = 900;
  const NODE_W = 132; // horizontal pitch per node
  const H = 260;

  const nodes = useMemo(() => {
    return items.map((it, i) => {
      const x = 90 + i * NODE_W;
      const y = H / 2 + Math.sin(i * 1.35) * 72;
      return { ...it, x, y, i };
    });
  }, [items]);

  const width = Math.max(W, 140 + items.length * NODE_W);

  const segColor = (a: PathNode & { x: number; y: number }, b: PathNode & { x: number; y: number }) => {
    if (a.status === "done" && b.status === "done") return "var(--mint)";
    if (a.status === "done" && b.status !== "locked") return "var(--primary)";
    return "var(--line)";
  };

  return (
    <div className="overflow-x-auto pb-2 -mx-2 px-2">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="list" aria-label="Learning path">
        {/* faint boundary orbit */}
        <ellipse cx={width / 2} cy={H / 2} rx={width / 2 - 20} ry={H / 2 - 24} fill="none" stroke="var(--line)" strokeDasharray="3 7" />
        {nodes.slice(0, -1).map((a, i) => {
          const b = nodes[i + 1];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (a.y > b.y ? 18 : -18);
          const d = `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
          return (
            <motion.path key={`seg-${a.itemId}`} d={d} fill="none" stroke={segColor(a, b)} strokeWidth={a.status === "done" ? 2 : 1.5}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              style={{ strokeDasharray: a.status === "done" ? "none" : "4 6" }}
            />
          );
        })}
        {nodes.map((n, i) => {
          const done = n.status === "done";
          const current = n.status === "current";
          const locked = n.status === "locked";
          return (
            <motion.g key={n.itemId} role="listitem"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: locked ? 0.55 : 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: "spring", stiffness: 260, damping: 20 }}
              onClick={() => !locked && onOpen(n)}
              className={locked ? "cursor-not-allowed" : "cursor-pointer"}
            >
              {current && (
                <circle cx={n.x} cy={n.y} r={20} fill="none" stroke="var(--primary)" strokeWidth="1.5"
                  style={{ transformOrigin: `${n.x}px ${n.y}px`, animation: "orbit-spin 4s linear infinite" }}
                  strokeDasharray="30 14" />
              )}
              {current && (
                <circle cx={n.x} cy={n.y} r={14} fill="var(--primary)" opacity="0.22">
                  <animate attributeName="r" values="14;20;14" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={n.x} cy={n.y} r={current ? 11 : 9}
                fill={done ? "var(--mint)" : current ? "var(--primary)" : "var(--raised)"}
                stroke={done ? "none" : current ? "none" : "var(--line)"}
                strokeWidth="1.5"
                style={done ? { filter: "drop-shadow(0 0 8px var(--glow-mint))" } : current ? { filter: "drop-shadow(0 0 10px var(--glow-primary))" } : {}}
              />
              {done && (
                <g transform={`translate(${n.x - 6}, ${n.y - 6})`} color="#06251e">
                  <Check size={12} strokeWidth={3.5} />
                </g>
              )}
              {locked && (
                <g transform={`translate(${n.x - 5}, ${n.y - 5})`}>
                  <Lock size={10} strokeWidth={2.5} color="var(--muted)" />
                </g>
              )}
              <text x={n.x} y={n.y + 30} textAnchor="middle" fontSize="11" fill="var(--text)" fontWeight={600}
                style={{ maxWidth: 120 }}>
                {n.title.length > 22 ? n.title.slice(0, 21) + "…" : n.title}
              </text>
              <text x={n.x} y={n.y + 45} textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-mono)">
                {n.estimatedMinutes} min
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
