"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toasts";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            ux_mode: "redirect";
            login_uri: string;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type GoogleAuthProps = { mode: "login" | "register" };

const initializedClients = new Set<string>();

export default function GoogleAuth({ mode }: GoogleAuthProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const render = () => {
      if (!ref.current || !window.google) return;
      const loginUri = `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/api/v1/auth/google`;
      const key = `${clientId}:${loginUri}`;
      if (!initializedClients.has(key)) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "redirect",
          login_uri: loginUri,
        });
        initializedClients.add(key);
      }
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: mode === "login" ? "signin_with" : "signup_with",
        shape: "pill",
        logo_alignment: "left",
        width: 320,
      });
    };

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google) render();
      else existing.addEventListener("load", render, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => toast.err("Google sign-in could not load. Check your connection and try again.");
    document.head.appendChild(script);
  }, [mode]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-raised/70 px-3 py-2.5 text-center text-xs text-muted">
        Google sign-in is not configured yet.
      </div>
    );
  }

  return <div ref={ref} className="flex justify-center" />;
}
