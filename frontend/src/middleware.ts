import { NextRequest, NextResponse } from "next/server";

// CORS for the versioned JSON API. In this deployment the SPA is same-origin, so this mainly
// covers decoupled frontends via ALLOWED_ORIGINS (comma-separated), pre-configured for local dev.
function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export function middleware(req: NextRequest) {
  const origin = allowedOrigin(req);
  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (origin) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
      res.headers.set("Access-Control-Max-Age", "86400");
    }
    return res;
  }
  const res = NextResponse.next();
  if (origin) res.headers.set("Access-Control-Allow-Origin", origin);
  return res;
}

export const config = { matcher: "/api/:path*" };
