"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

interface OrgChoice {
  organizationId: string;
  orgRole: "admin" | "teacher";
  adminName: string;
}

export default function TeacherLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [orgChoices, setOrgChoices] = useState<OrgChoice[] | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await getSupabaseBrowser().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !data.session) {
        setError("メールアドレスまたはパスワードが正しくありません");
        return;
      }

      const res = await fetch("/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "ログインに失敗しました");
        return;
      }

      if (body.needsOrgSelection) {
        setAccessToken(data.session.access_token);
        setOrgChoices(body.organizations ?? []);
        return;
      }

      router.push("/teacher/tests");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectOrg(organizationId: string) {
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/select-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, organizationId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "ログインに失敗しました");
        return;
      }
      router.push("/teacher/tests");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (orgChoices) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <h1 className="mb-6 text-center text-xl font-bold text-slate-800">どちらのページを開きますか</h1>
        <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow">
          {orgChoices.map((org) => (
            <button
              key={org.organizationId}
              type="button"
              disabled={loading}
              onClick={() => handleSelectOrg(org.organizationId)}
              className="rounded-md border border-slate-300 px-4 py-3 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {org.adminName}のページ
            </button>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-center text-xl font-bold text-slate-800">教員ログイン</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          メールアドレス
          <input
            type="email"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          パスワード
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        <div className="flex flex-col items-center gap-1 pt-2 text-sm">
          <Link href="/teacher/register" className="text-blue-600 hover:underline">
            はじめての方(登録)
          </Link>
          <Link href="/teacher/forgot-password" className="text-slate-500 hover:underline">
            パスワードをお忘れの方
          </Link>
        </div>
      </form>
    </main>
  );
}
