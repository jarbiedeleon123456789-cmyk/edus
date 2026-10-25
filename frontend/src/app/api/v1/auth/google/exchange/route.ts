import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/server/api";
import { verifyAuthHandoff } from "@/lib/server/auth";

const COOKIE_NAME = "edusphere_google_handoff";
const COOKIE_PATH = "/api/v1/auth/google/exchange";

export async function POST(req: Request) {
  const token = req.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token) return fail("Google sign-in session expired. Please try again.", 401);

  const session = await verifyAuthHandoff(token);
  const response = session
    ? ok(session, "Signed in with Google.")
    : fail("Google sign-in session expired. Please try again.", 401);

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}
