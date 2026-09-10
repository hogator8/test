import { NextRequest, NextResponse } from "next/server";
import {
  verifyTeacherToken,
  verifyStudentToken,
  verifyStudentCandidatesToken,
  TEACHER_COOKIE,
  STUDENT_COOKIE,
  STUDENT_CANDIDATES_COOKIE,
} from "@/lib/auth";

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*", "/api/teacher/:path*", "/api/student/:path*"],
};

const TEACHER_PUBLIC_PATHS = new Set([
  "/teacher/login",
  "/api/teacher/login",
  "/teacher/register",
  "/api/teacher/register",
  "/teacher/forgot-password",
  "/teacher/reset-password",
  "/teacher/accept-invite",
  "/api/teacher/accept-invite",
  "/api/teacher/select-org",
]);
const STUDENT_PUBLIC_PATHS = new Set(["/student/login", "/api/student/login"]);
// Passcode entry only needs the login-candidates cookie (which organization
// hasn't been decided yet at that point) - see STUDENT_CANDIDATES_COOKIE.
const STUDENT_CANDIDATE_PATHS = new Set(["/student/passcode", "/api/student/passcode"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/teacher") || pathname.startsWith("/api/teacher")) {
    if (TEACHER_PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    const token = req.cookies.get(TEACHER_COOKIE)?.value;
    const payload = await verifyTeacherToken(token);
    if (!payload) return denyOrRedirect(req, pathname, "/teacher/login");
    return NextResponse.next();
  }

  if (pathname.startsWith("/student") || pathname.startsWith("/api/student")) {
    if (STUDENT_PUBLIC_PATHS.has(pathname)) return NextResponse.next();
    if (STUDENT_CANDIDATE_PATHS.has(pathname)) {
      const token = req.cookies.get(STUDENT_CANDIDATES_COOKIE)?.value;
      const payload = await verifyStudentCandidatesToken(token);
      if (!payload) return denyOrRedirect(req, pathname, "/student/login");
      return NextResponse.next();
    }
    const token = req.cookies.get(STUDENT_COOKIE)?.value;
    const payload = await verifyStudentToken(token);
    if (!payload) return denyOrRedirect(req, pathname, "/student/login");
    return NextResponse.next();
  }

  return NextResponse.next();
}

function denyOrRedirect(req: NextRequest, pathname: string, loginPath: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = loginPath;
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
