"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, ChevronRight, Code2, Gauge, PenLine, ShieldCheck, Waypoints } from "lucide-react";
import { Logo, OrbitMark } from "@/components/Logo";
import { ToastHost } from "@/components/Toasts";
import { Magnetic, Marquee, OrbitField, ParallaxY, TiltCard } from "@/components/FX";
import { OrbitHero, PhotoCard, WaveDivider } from "@/components/LandingArt";

const ease = [0.22, 1, 0.36, 1] as const;
const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease },
};

// Photos are quality-matched to each module's subject: code screens for the playground,
// note-taking review for peer feedback, graduation for credentials, classroom for the walkthrough.
const IMG = {
  playground: "https://images.pexels.com/photos/5473301/pexels-photo-5473301.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  playgroundCredit: "cottonbro studio / Pexels",
  review: "https://images.pexels.com/photos/5912280/pexels-photo-5912280.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  reviewCredit: "Roman Odintsov / Pexels",
  credentials: "https://images.pexels.com/photos/8093032/pexels-photo-8093032.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  credentialsCredit: "olia danilevich / Pexels",
  classroom: "https://images.pexels.com/photos/20432872/pexels-photo-20432872.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  classroomCredit: "Adam Sondel / Pexels",
};

export default function Landing() {
  return (
    <div className="relative overflow-x-clip">
      {/* nav */}
      <header className="absolute top-0 inset-x-0 z-50">
        <div className="max-w-[1160px] mx-auto px-5 md:px-8 h-[76px] flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted">
            <a href="#how" className="hover:text-text transition-colors">How it works</a>
            <a href="#features" className="hover:text-text transition-colors">Modules</a>
            <a href="#pricing" className="hover:text-text transition-colors">Pricing</a>
            <Link href="/verify" className="hover:text-text transition-colors">Verify a credential</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost !py-2">Sign in</Link>
            <Magnetic><Link href="/register" className="btn btn-primary !py-2">Create account</Link></Magnetic>
          </div>
        </div>
      </header>

      {/* hero — living constellation field behind everything */}
      <section className="relative pt-[150px] md:pt-[170px] pb-10 md:pb-14 min-h-[92vh] flex flex-col justify-center">
        <OrbitField density={1} />
        <div className="glow-blob w-[520px] h-[520px] -top-40 -left-40" style={{ background: "var(--glow-primary)" }} />
        <div className="glow-blob w-[420px] h-[420px] top-32 right-[-120px]" style={{ background: "var(--glow-mint)" }} />
        <div className="max-w-[1160px] mx-auto px-5 md:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center relative">
          <div>
            <motion.p className="eyebrow flex items-center gap-2" {...fadeUp}>
              <span className="w-1.5 h-1.5 rounded-full bg-mint inline-block" /> Adaptive learning + skills evaluation
            </motion.p>
            <h1 className="display font-extrabold tracking-tight mt-5 text-[clamp(38px,6vw,64px)] leading-[1.02]">
              {"A skill map that redraws itself after "
                .split(" ")
                .map((w, i) => (
                  <motion.span key={i} className="inline-block mr-[0.24em]"
                    initial={{ opacity: 0, y: 24, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.55, ease }}>
                    {w}
                  </motion.span>
                ))}
              <motion.em className="font-accent not-italic underline decoration-mint/60 decoration-[3px] underline-offset-8"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65, duration: 0.6 }}>
                every placement.
              </motion.em>
            </h1>
            <motion.p className="text-muted text-[17px] leading-relaxed mt-6 max-w-[520px]" {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.5 }}>
              Ten placement questions produce a per-skill gap report. EduSphere re-sequences your course so the weakest skills come first, then holds you to a pace measured in real lessons per day — no streak theatre without the work.
            </motion.p>
            <motion.div className="flex flex-wrap items-center gap-3 mt-9" {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.6 }}>
              <Magnetic><Link href="/register" className="btn btn-primary text-[15px] !px-6 !py-3.5">Start the free placement <ArrowRight size={16} /></Link></Magnetic>
              <Magnetic strength={0.2}><Link href="/verify/EDU-7Q4M-92XT" className="btn btn-ghost text-[15px] !px-5 !py-3.5"><ShieldCheck size={16} /> See a live credential</Link></Magnetic>
            </motion.div>
            <motion.div className="mt-8 font-mono text-[11px] text-muted flex flex-wrap gap-x-5 gap-y-1.5" {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.7 }}>
              <span>10-question placement</span>
              <span>Rule-based path engine</span>
              <span>3 reviewers per submission</span>
              <span>0 real payments</span>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.25, ease }} className="hidden md:block">
            <OrbitHero />
          </motion.div>
        </div>
      </section>

      <Marquee items={["Placement", "Gap report", "Sequenced path", "Sandbox run", "Peer review", "Streaks + XP", "Certificate", "Public verify"]} />

      {/* how it works — numbers on the left, rippled-sand poster on the right */}
      <section id="how" className="max-w-[1160px] mx-auto px-5 md:px-8 py-20 md:py-28">
        <motion.div {...fadeUp}>
          <p className="eyebrow">How a path gets built</p>
          <h2 className="display font-extrabold tracking-tight text-[clamp(26px,3.6vw,40px)] mt-3 max-w-2xl">
            Measure first. Sequence second. Lock until it&apos;s done.
          </h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {[
            { icon: Gauge, n: "01", t: "Placement reveals gaps", d: "8 multiple-choice and 2 written questions, each tagged to a skill. The report scores JavaScript Basics, Async, Arrays and five more from 0–100 — one number per skill, no vague grade." },
            { icon: Waypoints, n: "02", t: "The path engine re-sequences", d: "Every lesson carries a gap score: the average distance between your mastery and 100%. Highest gap goes first. Completed lessons stay fixed; everything else moves." },
            { icon: BadgeCheck, n: "03", t: "Velocity sets the aperture", d: "Your trailing 14 days of completed lessons set how many items unlock at once. Finish one, the next opens. Finish all of them and a certificate with a public verify link is issued." },
          ].map((s, i) => (
            <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.12 }}>
              <TiltCard className="card p-6 h-full relative" max={6}>
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-xl bg-raised grid place-items-center text-primary"><s.icon size={17} /></span>
                  <span className="font-mono text-muted text-xs">{s.n}</span>
                </div>
                <h3 className="display font-bold text-lg mt-5">{s.t}</h3>
                <p className="text-muted text-[13.5px] leading-relaxed mt-2">{s.d}</p>
              </TiltCard>
            </motion.div>
          ))}
        </div>
        <ParallaxY amount={34} className="mt-10">
          <PhotoCard src={IMG.classroom} alt="A laptop open on a desk in a classroom, ready for a lesson" credit={IMG.classroomCredit} aspect="aspect-[21/7]" />
        </ParallaxY>
      </section>

      {/* features — copy plus poster photography, alternating */}
      <section id="features" className="border-y border-line bg-surface/40">
        <div className="max-w-[1160px] mx-auto px-5 md:px-8 py-20 md:py-28 space-y-24">
          {[
            {
              icon: Code2, kicker: "Playground", title: "Code runs in a sandbox, tests argue back",
              body: "The editor is Monaco — the VS Code engine. JavaScript runs server-side in a 4-second sandbox; each test case reports pass or fail with your console output. The Two Sum exercise's hidden case is 100,000 items: the double loop passes the visible tests and times out on the hidden one, exactly the lesson it exists to teach.",
              img: IMG.playground, credit: IMG.playgroundCredit,
              aside: ["stdout / stderr / runtime ms", "per-case console capture", "HTML/CSS/JS live preview in a sandboxed iframe"],
            },
            {
              icon: PenLine, kicker: "Peer review", title: "Three classmates grade it. Nobody knows whose it is.",
              body: "Submitting an assignment automatically enqueues it for three reviews. The assigner never picks you, never repeats a reviewer, and always picks the least-loaded student first. Payloads show \"Author #2KF7N\" — no IDs, no names, either direction. Rubric sliders produce a live total; reviews worth writing take more than 20 characters.",
              img: IMG.review, credit: IMG.reviewCredit,
              aside: ["balanced-load assigner", "rubric sliders with live total", "feedback arrives as a notification"],
            },
            {
              icon: BadgeCheck, kicker: "Credentials", title: "Certificates anyone can check in one request",
              body: "Complete a path and a certificate lands in your records with a code like EDU-7Q4M-92XT. The /verify page is public — no login — and answers who holds it, which course, and when. XP feeds a square-root level curve, badges pay one-time bonuses, and the leaderboard counts only students.",
              img: IMG.credentials, credit: IMG.credentialsCredit,
              aside: ["public GET /api/v1/verify/:code", "8 earnable badges in the seed", "print-ready certificate view"],
            },
          ].map((f, i) => (
            <motion.div key={f.kicker} className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`} {...fadeUp}>
              <div>
                <p className="eyebrow flex items-center gap-2"><f.icon size={14} /> {f.kicker}</p>
                <h3 className="display font-extrabold tracking-tight text-[clamp(22px,3vw,32px)] mt-3">{f.title}</h3>
                <p className="text-muted leading-relaxed mt-4 max-w-[480px]">{f.body}</p>
                <div className="card p-5 mt-6 space-y-2.5 max-w-[480px]">
                  {f.aside.map((a) => (
                    <div key={a} className="flex items-center gap-3 text-sm">
                      <ChevronRight size={14} className="text-mint shrink-0" />
                      <span className="text-muted">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ParallaxY amount={i % 2 ? 40 : 26}>
                <TiltCard max={7}>
                  <PhotoCard src={f.img} alt={`${f.kicker} — module illustration`} credit={f.credit} aspect="aspect-[4/3]" />
                </TiltCard>
              </ParallaxY>
            </motion.div>
          ))}
        </div>
      </section>

      <WaveDivider />

      {/* pricing */}
      <section id="pricing" className="max-w-[1160px] mx-auto px-5 md:px-8 py-20 md:py-28">
        <motion.div {...fadeUp} className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="display font-extrabold tracking-tight text-[clamp(26px,3.6vw,40px)] mt-3">Free while you place. Pro when you compete.</h2>
          <p className="text-muted mt-3 max-w-xl mx-auto text-[15px]">Payments run through Stripe in test mode. In this demo deployment no keys are configured, so checkout completes as a recorded test payment.</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {[
            { name: "Free", price: "$0", per: "forever", items: ["Placement + adaptive path", "Playground with visible tests", "Public leaderboard"], cta: "Create account", href: "/register", primary: false },
            { name: "Pro", price: "$12", per: "per month", items: ["Everything in Free", "Hidden tests revealed after pass", "Certificate codes for every course", "Priority peer-review matching"], cta: "Try Pro checkout", href: "/billing", primary: true },
            { name: "Team", price: "$8", per: "per seat / month", items: ["Everything in Pro", "Instructor dashboards", "Cohort leaderboards", "Live session scheduling"], cta: "Try Team checkout", href: "/billing", primary: false },
          ].map((p, i) => (
            <motion.div key={p.name} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}>
              <TiltCard max={5} className={`card p-7 flex flex-col h-full ${p.primary ? "border-primary/50 !bg-raised relative overflow-hidden" : ""}`}>
                {p.primary && <div className="absolute top-0 right-0 font-mono text-[10px] bg-primary text-primary-ink px-3 py-1 rounded-bl-xl">popular</div>}
                <p className="eyebrow">{p.name}</p>
                <p className="mt-3"><span className="display text-4xl font-extrabold">{p.price}</span> <span className="text-muted text-sm">{p.per}</span></p>
                <ul className="space-y-2.5 mt-6 flex-1">
                  {p.items.map((it) => (
                    <li key={it} className="flex gap-2.5 text-sm text-muted"><ChevronRight size={14} className="text-mint shrink-0 mt-0.5" />{it}</li>
                  ))}
                </ul>
                <Magnetic strength={0.15} className="mt-7 w-full">
                  <Link href={p.href} className={`btn w-full ${p.primary ? "btn-primary" : "btn-ghost"}`}>{p.cta}</Link>
                </Magnetic>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* demo access */}
      <section className="max-w-[1160px] mx-auto px-5 md:px-8 pb-24">
        <motion.div className="card-raise p-7 md:p-9 grid md:grid-cols-[1fr_auto] gap-6 items-center" {...fadeUp}>
          <div>
            <p className="eyebrow">Demo access — seeded placeholder data</p>
            <h3 className="display font-bold text-xl mt-2">Three accounts, one password: <span className="font-mono text-mint">password123</span></h3>
            <div className="font-mono text-[12.5px] text-muted mt-3 space-y-1">
              <p>aria@edusphere.dev — student, mid-path, queue waiting</p>
              <p>instructor@edusphere.dev — class analytics and grading</p>
              <p>admin@edusphere.dev — user management</p>
            </div>
          </div>
          <Magnetic><Link href="/login" className="btn btn-mint !px-6 !py-3.5 justify-self-start md:justify-self-end">Open the demo <ArrowRight size={15} /></Link></Magnetic>
        </motion.div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1160px] mx-auto px-5 md:px-8 py-8 flex flex-wrap items-center justify-between gap-4">
          <OrbitMark size={22} />
          <p className="text-muted text-xs font-mono">EduSphere demo build. Seed data is fictional; payments are Stripe test mode.</p>
          <div className="flex gap-5 text-xs text-muted">
            <Link href="/verify" className="hover:text-text">Verify</Link>
            <Link href="/login" className="hover:text-text">Sign in</Link>
            <Link href="/register" className="hover:text-text">Register</Link>
          </div>
        </div>
      </footer>
      <ToastHost />
    </div>
  );
}
