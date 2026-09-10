import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Edge-compatible (Web Crypto based) JWT helpers used both in middleware
// (Edge runtime) and in API routes (Node runtime).

export const TEACHER_COOKIE = "teacher_session";
export const STUDENT_COOKIE = "student_session";
// Holds every (organization, student row) pair whose password matched at
// login, before the student has picked which organization's test to take
// (student_id is only unique per-organization since v16, so one login can
// match more than one organization). Kept separate from STUDENT_COOKIE -
// and never cleared on resolution - so the HOME flow can re-enter the
// passcode step for a different organization without logging in again.
export const STUDENT_CANDIDATES_COOKIE = "student_login_candidates";

const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Configure it in your environment.");
  }
  return encoder.encode(secret);
}

export interface TeacherTokenPayload extends JWTPayload {
  role: "teacher";
  userId: string; // Supabase auth.users.id
  organizationId: string; // organization currently being viewed
  orgRole: "admin" | "teacher"; // this user's role within organizationId
}

export interface StudentTokenPayload extends JWTPayload {
  role: "student";
  studentDbId: string;
  studentId: string;
  name: string;
}

export interface StudentCandidate {
  studentDbId: string;
  organizationId: string;
}

export interface StudentCandidatesTokenPayload extends JWTPayload {
  role: "student_candidates";
  candidates: StudentCandidate[];
}

export async function signTeacherToken(
  payload: Omit<TeacherTokenPayload, "role">
): Promise<string> {
  return new SignJWT({ role: "teacher", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function signStudentToken(
  payload: Omit<StudentTokenPayload, "role">
): Promise<string> {
  return new SignJWT({ role: "student", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifyTeacherToken(
  token: string | undefined
): Promise<TeacherTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "teacher") return null;
    return payload as TeacherTokenPayload;
  } catch {
    return null;
  }
}

export async function verifyStudentToken(
  token: string | undefined
): Promise<StudentTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "student") return null;
    return payload as StudentTokenPayload;
  } catch {
    return null;
  }
}

export async function signStudentCandidatesToken(
  payload: Omit<StudentCandidatesTokenPayload, "role">
): Promise<string> {
  return new SignJWT({ role: "student_candidates", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifyStudentCandidatesToken(
  token: string | undefined
): Promise<StudentCandidatesTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "student_candidates") return null;
    return payload as StudentCandidatesTokenPayload;
  } catch {
    return null;
  }
}
