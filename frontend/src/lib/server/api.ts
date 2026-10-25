import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";

// Consistent response envelope used by every /api/v1 route.
export function ok<T>(data: T, message = "OK", status = 200) {
  return NextResponse.json({ success: true, message, data, errors: null }, { status });
}

export function fail(message: string, status = 400, errors: Record<string, string> | null = null) {
  return NextResponse.json({ success: false, message, data: null, errors }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail("Request body must be valid JSON.", 400) };
  }
  try {
    return { data: schema.parse(raw) };
  } catch (e) {
    if (e instanceof ZodError) {
      const errors: Record<string, string> = {};
      for (const issue of e.issues) errors[issue.path.join(".")] = issue.message;
      const first = Object.values(errors)[0] ?? "Invalid input.";
      return { error: fail(first, 422, errors) };
    }
    return { error: fail("Invalid input.", 422) };
  }
}

// In-memory sliding-window limiter. Good enough per instance; swap for Redis behind multiple replicas.
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

// Deterministic pseudonym shown instead of user IDs inside peer-review payloads.
export function aliasFor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "#" + (h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 5);
}
