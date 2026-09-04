import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Edge-compatible (Web Crypto based) JWT helpers used both in middleware
// (Edge runtime) and in API routes (Node runtime).

export const TEACHER_COOKIE = "teacher_session";
export const STUDENT_COOKIE = "student_session";

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
}

export interface StudentTokenPayload extends JWTPayload {
  role: "student";
  studentDbId: string;
  studentId: string;
  name: string;
}

export async function signTeacherToken(): Promise<string> {
  return new SignJWT({ role: "teacher" })
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
