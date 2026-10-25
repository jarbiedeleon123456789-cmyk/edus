"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Check, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "@/components/Toasts";
import { api } from "@/lib/api";
import { buildProfileAvatar, useAuth, type User } from "@/lib/store";

const MAX_BIO = 180;

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(user?.bio ?? "Building momentum, one lesson at a time.");
  const [avatar, setAvatar] = useState(user?.avatar ?? buildProfileAvatar(user?.name ?? "Student"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<{ user: User }>("/api/v1/auth/me").then((res) => {
      if (!active) return;
      if (!res.success) {
        toast.err(res.message);
        return;
      }
      setUser(res.data.user);
      setBio(res.data.user.bio ?? "Building momentum, one lesson at a time.");
      setAvatar(res.data.user.avatar ?? buildProfileAvatar(res.data.user.name));
    });
    return () => { active = false; };
  }, [setUser]);

  if (!user) return null;

  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "ST";

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      toast.err("Choose a PNG, JPEG, WEBP, or GIF image.");
      event.target.value = "";
      return;
    }
    if (file.size > 1_000_000) {
      toast.err("Profile photos must be 1 MB or smaller.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatar(reader.result);
    };
    reader.onerror = () => toast.err("The selected image could not be read.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await api.patch<{ user: User }>("/api/v1/profile", { bio, avatar });
    setSaving(false);
    if (!res.success) {
      toast.err(res.message);
      return;
    }
    setUser(res.data.user);
    toast.ok("Profile saved — your orbit is looking sharper.");
  };

  const handleReset = async () => {
    const defaultAvatar = buildProfileAvatar(user.name);
    const defaultBio = "Building momentum, one lesson at a time.";
    const res = await api.patch<{ user: User }>("/api/v1/profile", { bio: defaultBio, avatar: defaultAvatar });
    if (!res.success) {
      toast.err(res.message);
      return;
    }
    setAvatar(defaultAvatar);
    setBio(defaultBio);
    setUser(res.data.user);
    toast.info("Profile reset to your default orbit look.");
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="relative overflow-hidden rounded-[26px] border border-line bg-[radial-gradient(circle_at_top_left,_rgba(91,155,216,0.22),transparent_35%),linear-gradient(135deg,var(--surface),var(--raised))] p-6 md:p-8">
        <div className="glow-blob left-1/2 top-6 h-56 w-56 bg-primary/15" />
        <div className="glow-blob bottom-0 right-0 h-56 w-56 bg-mint/10" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={avatar}
                alt={`${user.name} profile`}
                className="h-24 w-24 rounded-full border-4 border-surface object-cover shadow-[0_22px_44px_-18px_rgba(19,74,124,0.7)]"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-primary shadow-lg transition hover:scale-[1.03]"
                aria-label="Upload profile picture"
              >
                <Camera size={16} />
              </button>
            </div>

            <div>
              <div className="tag mb-2"><Sparkles size={11} /> profile spotlight</div>
              <h1 className="display text-3xl md:text-4xl font-bold tracking-tight">{user.name}</h1>
              <p className="text-muted text-sm mt-1">Level {user.level} learner · {user.xp.toLocaleString()} XP earned</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
              <Upload size={15} /> Upload photo
            </button>
            <button type="button" onClick={handleReset} className="btn btn-ghost">
              <Wand2 size={15} /> Reset style
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 md:p-6"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="eyebrow">About you</p>
              <h2 className="display text-2xl font-bold mt-2">A short bio that feels like your orbit.</h2>
            </div>
            <span className="tag">{bio.length}/{MAX_BIO}</span>
          </div>

          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value.slice(0, MAX_BIO))}
            rows={5}
            className="input resize-none"
            placeholder="I turn confusion into momentum by shipping tiny wins, testing ideas fast, and learning in public."
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-muted text-sm">Your bio and profile photo are saved to your account.</p>
            <button type="button" onClick={handleSave} className="btn btn-mint" disabled={saving}>
              <Check size={15} /> {saving ? "Saving" : "Save profile"}
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="card p-5 md:p-6"
        >
          <p className="eyebrow">Preview</p>
          <div className="mt-4 rounded-[22px] border border-line bg-[radial-gradient(circle_at_top,_rgba(19,74,124,0.14),transparent_40%),linear-gradient(180deg,var(--surface),var(--raised))] p-4">
            <div className="flex items-center gap-3">
              <img src={avatar} alt="Preview" className="h-14 w-14 rounded-full object-cover border border-line" />
              <div>
                <p className="font-semibold text-base">{user.name}</p>
                <p className="font-mono text-[11px] text-muted">{initials} · active learner</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-surface/80 p-3">
              <p className="text-[12px] uppercase tracking-[0.2em] text-muted">Current vibe</p>
              <p className="mt-2 text-sm leading-6 text-text">{bio || "Building momentum, one lesson at a time."}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["XP", user.xp.toLocaleString()],
                ["Level", String(user.level)],
                ["Streak", "3d"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-surface/70 p-2">
                  <p className="font-mono text-[10px] text-muted">{label}</p>
                  <p className="mt-1 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.aside>
      </div>

      <div className="card p-5 md:p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="eyebrow">Quick wins</p>
            <h3 className="display text-2xl font-bold mt-2">Make the profile feel like you, not a template.</h3>
          </div>
          <Link href="/dashboard" className="link text-sm font-medium">Back to dashboard</Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            "Add a photo that feels like your real study style.",
            "Keep the bio short, specific, and memorable.",
            "Use the profile as your visible identity across the platform.",
          ].map((tip) => (
            <div key={tip} className="rounded-2xl border border-line bg-raised/80 p-4 text-sm text-muted">
              {tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
