"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SphereLoader } from "@/components/Logo";
import { getPostAuthPath, useAuth } from "@/lib/store";
import { api } from "@/lib/api";

type GoogleSession = { user: never; access: string; refresh: string; isNew: boolean };

export default function GoogleCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void api.post<GoogleSession>("/api/v1/auth/google/exchange").then((res) => {
      if (!res.success) {
        setError(res.message);
        return;
      }
      useAuth.getState().setAuth(res.data.user, res.data.access, res.data.refresh);
      router.replace(getPostAuthPath(res.data.user, { isNew: !!res.data.isNew }));
    }).catch(() => {
      setError("Could not finish Google sign-in. Please try again.");
    });
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="display text-xl font-bold">Google sign-in didn&apos;t finish</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Link href="/login" className="btn btn-primary mt-5">Back to sign in</Link>
        </div>
      </main>
    );
  }

  return <div className="min-h-screen grid place-items-center"><SphereLoader label="Finishing Google sign-in" /></div>;
}
