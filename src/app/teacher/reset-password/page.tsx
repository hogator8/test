"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

// Reached via the link in the password-reset email. The Supabase client
// picks up the recovery session from the URL fragment automatically
// (detectSessionInUrl defaults to true), so submitting here just needs to
// call updateUser - no token handling of our own is required.
export default function TeacherResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await getSupabaseBrowser().auth.updateUser({ password });
      if (updateError) {
        setError("パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります");
        return;
      }
      setDone(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <div className="flex flex-col gap-4 rounded-lg bg-white p-6 text-center shadow">
          <p className="text-slate-700">パスワードを更新しました。</p>
          <button
            type="button"
            onClick={() => router.push("/teacher/login")}
            className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            ログイン画面へ
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-center text-xl font-bold text-slate-800">新しいパスワードの設定</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          新しいパスワード
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          新しいパスワード(確認)
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "更新中..." : "パスワードを更新"}
        </button>
      </form>
    </main>
  );
}
