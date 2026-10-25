"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, ShieldCheck, ShieldX } from "lucide-react";
import { Logo, SphereLoader } from "./Logo";

type VerifyData = { valid: true; code: string; holder: string; course: string; level: string; issuedAt: string };

export default function VerifyClient({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialCode);
  const [data, setData] = useState<VerifyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!initialCode);

  useEffect(() => {
    if (!initialCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/verify/${encodeURIComponent(initialCode.trim())}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) setData(json.data);
        else { setData(null); setError(json.message); }
      } catch {
        if (!cancelled) setError("The verification service didn't answer. Try again in a moment.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initialCode]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-[1160px] w-full mx-auto px-5 md:px-8 h-[76px] flex items-center justify-between print:hidden">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="btn btn-ghost !py-2">Sign in</Link>
      </header>

      <main className="flex-1 max-w-[760px] w-full mx-auto px-5 py-12">
        <div className="print:hidden">
          <p className="eyebrow flex items-center gap-2"><ShieldCheck size={14} /> Credential verification</p>
          <h1 className="display text-[clamp(26px,4vw,38px)] font-extrabold tracking-tight mt-3">Check a certificate before you trust it</h1>
          <p className="text-muted mt-3 max-w-xl">Paste the code printed on an EduSphere certificate — format <span className="font-mono">EDU-XXXX-XXXX</span>. This page reads the public endpoint <span className="font-mono text-xs">GET /api/v1/verify/:code</span>; no login needed.</p>
          <form
            className="flex gap-2 mt-7"
            onSubmit={(e) => { e.preventDefault(); if (input.trim()) router.push(`/verify/${input.trim().toUpperCase()}`); }}
          >
            <input className="input font-mono uppercase" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="EDU-7Q4M-92XT" aria-label="Credential code" />
            <button className="btn btn-primary shrink-0"><Search size={15} /> Verify</button>
          </form>
        </div>

        <div className="mt-8">
          {loading && <SphereLoader label="Looking up the registry" />}
          {!loading && error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6 flex items-start gap-4 border-coral/40">
              <ShieldX size={22} className="text-coral shrink-0 mt-0.5" />
              <div>
                <h2 className="display font-bold text-lg">Not a valid credential</h2>
                <p className="text-muted text-sm mt-1">{error}</p>
              </div>
            </motion.div>
          )}
          {!loading && data && <Certificate data={data} />}
        </div>
      </main>

      <footer className="border-t border-line py-6 print:hidden">
        <p className="max-w-[1160px] mx-auto px-5 md:px-8 text-muted text-xs font-mono">Verification is public by design — the code authorizes the lookup.</p>
      </footer>
    </div>
  );
}

function Certificate({ data }: { data: VerifyData }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }} className="relative">
      <div className="card relative overflow-hidden p-8 md:p-12">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(70% 60% at 50% 0%, var(--glow-primary), transparent)" }} />
        <img
          src="https://images.pexels.com/photos/6345305/pexels-photo-6345305.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=300&w=1200"
          alt=""
          aria-hidden
          className="absolute top-0 inset-x-0 h-24 w-full object-cover opacity-20"
          loading="lazy"
          style={{ maskImage: "linear-gradient(180deg, black, transparent)" }}
        />
        <div className="relative flex flex-col items-center text-center">
          <motion.div className="relative w-20 h-20" initial={{ rotate: 0 }} animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}>
            <div className="absolute inset-0 rounded-full border-2 border-mint/60 border-dashed" />
            <div className="absolute inset-[30%] rounded-full bg-primary" />
            <div className="absolute -top-1 left-1/2 -ml-1 w-2 h-2 rounded-full bg-mint" />
          </motion.div>
          <p className="eyebrow mt-6">EduSphere certifies that</p>
          <h2 className="display text-[clamp(28px,5vw,42px)] font-extrabold tracking-tight mt-2">{data.holder}</h2>
          <p className="text-muted mt-3">completed <span className="font-accent italic text-text text-lg">{data.course}</span></p>
          <p className="text-muted text-sm mt-1">
            Level: {data.level} · Issued {new Date(data.issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div className="mt-8 flex items-center gap-3 card-raise px-5 py-3">
            <ShieldCheck size={16} className="text-mint" />
            <span className="font-mono text-sm tracking-widest">{data.code}</span>
          </div>
          <p className="text-mint text-xs font-mono mt-4">VALID · registry lookup positive</p>
          <button className="btn btn-ghost mt-6 !py-2 print:hidden" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
      </div>
    </motion.div>
  );
}
