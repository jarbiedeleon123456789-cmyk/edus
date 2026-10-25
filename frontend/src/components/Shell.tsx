"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck, Bell, BookOpen, ClipboardCheck, Compass, Gauge, Inbox, LayoutDashboard, LogOut, Moon, PenLine,
  Radio, Sun, Trophy, Users, Wallet, Waypoints, FlaskConical, MessageSquareText, ShieldCheck, UserRound,
} from "lucide-react";
import { Logo, SphereLoader } from "./Logo";
import { ToastHost, toast } from "./Toasts";
import { useAuth, hydrateAuth } from "@/lib/store";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/hooks";

const NAV = {
  student: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/profile", label: "Profile", icon: UserRound },
    { href: "/assessment", label: "Placement", icon: Gauge },
    { href: "/path", label: "My Path", icon: Waypoints },
    { href: "/playground", label: "Playground", icon: FlaskConical },
    { href: "/assignments", label: "Assignments", icon: ClipboardCheck },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/review", label: "Peer Review", icon: PenLine },
    { href: "/feedback", label: "Feedback", icon: MessageSquareText },
    { href: "/progress", label: "Progress", icon: Trophy },
    { href: "/badges", label: "Credentials", icon: BadgeCheck },
    { href: "/leaderboard", label: "Leaderboard", icon: Users },
    { href: "/sessions", label: "Live Sessions", icon: Radio },
    { href: "/billing", label: "Billing", icon: Wallet },
  ],
  instructor: [
    { href: "/instructor", label: "Classroom", icon: BookOpen },
    { href: "/instructor/assignments", label: "Assignments", icon: ClipboardCheck },
    { href: "/instructor/courses", label: "Course builder", icon: BookOpen },
    { href: "/playground", label: "Playground", icon: FlaskConical },
    { href: "/sessions", label: "Live Sessions", icon: Radio },
    { href: "/leaderboard", label: "Leaderboard", icon: Users },
  ],
  admin: [
    { href: "/admin", label: "Admin", icon: ShieldCheck },
    { href: "/sessions", label: "Live Sessions", icon: Radio },
  ],
};

export function useRequireAuth(role?: string) {
  const { user, hydrated } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace("/login");
    else if (role === "instructor" && user.role === "student") router.replace("/dashboard");
    else if (role === "admin" && user.role !== "admin") router.replace("/dashboard");
  }, [user, hydrated, role, router]);
  return { user, hydrated, ready: !!user && hydrated };
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, hydrated, ready } = useRequireAuth();
  const [theme, setTheme] = useState<string>("dark");
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<{ rows: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[]; unread: number } | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { hydrateAuth(); }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const nav = useMemo(() => (user ? (NAV[user.role] ?? NAV.student) : []), [user]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void api.get<typeof notes>("/api/v1/notifications").then((res) => {
      if (!cancelled && res.success) setNotes(res.data);
    });
    return () => { cancelled = true; };
  }, [ready, pathname]);

  const markRead = async () => {
    await api.patch("/api/v1/notifications", { all: true });
    const res = await api.get<typeof notes>("/api/v1/notifications");
    if (res.success) setNotes(res.data);
  };

  const logout = async () => {
    const { refresh, clear } = useAuth.getState();
    try {
      if (refresh) await api.post("/api/v1/auth/logout", { refresh });
    } catch {
      // Ignore server-side logout errors; the client session is still cleared locally.
    } finally {
      clear();
      toast.info("Signed out.");
      router.replace("/login");
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("edu-theme", next);
    setTheme(next);
  };

  if (!ready || !user) {
    return <div className="min-h-screen grid place-items-center"><SphereLoader label={hydrated ? "Redirecting" : "Opening EduSphere"} /></div>;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-[68px] lg:w-[218px] shrink-0 border-r border-line flex flex-col fixed inset-y-0 z-40 bg-surface/60 backdrop-blur">
        <Link href="/dashboard" className="px-4 lg:px-5 h-16 flex items-center justify-center lg:justify-start">
          <span className="hidden lg:block"><Logo /></span>
          <span className="lg:hidden"><Logo size={26} /></span>
        </Link>
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted hover:text-text"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/25"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                )}
                <Icon size={17} className="shrink-0 relative" />
                <span className="hidden lg:block relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-2.5 border-t border-line">
          <Link href="/profile" className="rounded-xl p-2.5 hidden lg:flex items-center gap-3 mb-2 text-left hover:bg-raised transition-colors">
            <img src={user.avatar ?? ""} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-line" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate">{user.name}</p>
              <p className="font-mono text-[11px] text-muted truncate">Level {user.level} · {user.xp.toLocaleString()} XP</p>
            </div>
          </Link>
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-muted hover:text-coral transition-colors">
            <LogOut size={17} /> <span className="hidden lg:block">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-[68px] lg:ml-[218px] flex flex-col min-h-screen">
        <header className="h-16 border-b border-line flex items-center justify-between px-5 md:px-8 sticky top-0 z-30 bg-bg/70 backdrop-blur">
          <div className="lg:hidden"><Logo size={24} /></div>
          <div className="hidden lg:flex items-center gap-2 text-muted text-sm font-mono">
            <Inbox size={14} />
            <span className="truncate max-w-md">{pathname === "/dashboard" ? "every orbit starts with one lesson" : pathname}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={toggleTheme} aria-label="Toggle theme" className="w-9 h-9 rounded-lg grid place-items-center text-muted hover:text-text hover:bg-raised transition-colors">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="relative">
              <button onClick={() => { setBellOpen((v) => !v); }} aria-label="Notifications"
                className="w-9 h-9 rounded-lg grid place-items-center text-muted hover:text-text hover:bg-raised transition-colors relative">
                <Bell size={17} />
                {notes && notes.unread > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-coral text-[9px] font-bold text-white grid place-items-center">
                    {notes.unread}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-[340px] card shadow-2xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                      <p className="font-semibold text-sm">Notifications</p>
                      <button onClick={markRead} className="text-xs link">Mark all read</button>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto">
                      {!notes?.rows.length && <p className="text-muted text-sm p-4">Nothing yet — badge arrivals and review assignments land here.</p>}
                      {notes?.rows.map((n) => (
                        <div key={n.id} className={`px-4 py-3 border-b border-line/60 ${n.readAt ? "opacity-55" : ""}`}>
                          <p className="text-[13px] font-medium">{n.title}</p>
                          <p className="text-xs text-muted mt-0.5">{n.body}</p>
                          <p className="font-mono text-[10px] text-muted mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Link href="/profile" className="hidden sm:flex items-center gap-2 ml-1 rounded-full border border-line pl-1.5 pr-3 py-1.5 hover:border-primary/60 transition-colors">
              <img src={user.avatar ?? ""} alt={user.name} className="w-7 h-7 rounded-full object-cover border border-line" />
              <div className="min-w-0 flex items-center gap-1.5 text-left">
                <Compass size={14} className="text-amber" />
                <span className="font-mono text-xs">{user.xp.toLocaleString()} XP</span>
              </div>
            </Link>
          </div>
        </header>
        <main className="flex-1 px-5 md:px-8 py-7 max-w-[1200px] w-full mx-auto">
          <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
