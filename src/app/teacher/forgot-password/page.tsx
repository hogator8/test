"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

export default function TeacherForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: resetError } = await getSupabaseBrowser().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/teacher/reset-password`,
      });
      if (resetError) {
        setError("送信に失敗しました");
        return;
      }
      setSent(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <div className="flex flex-col gap-4 rounded-lg bg-white p-6 text-center shadow">
          <p className="text-slate-700">
            パスワード再設定用のメールを送信しました。メール内のリンクからパスワードを再設定してください。
          </p>
          <Link href="/teacher/login" className="text-sm text-blue-600 hover:underline">
            ログイン画面に戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-center text-xl font-bold text-slate-800">パスワード再設定</h1>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "送信中..." : "再設定メールを送信"}
        </button>
        <div className="flex justify-center pt-2 text-sm">
          <Link href="/teacher/login" className="text-blue-600 hover:underline">
            ログイン画面に戻る
          </Link>
        </div>
      </form>
    </main>
  );
}
