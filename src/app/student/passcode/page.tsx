"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentPasscodePage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/student/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "パスコードが正しくありません");
        return;
      }
      router.push(`/student/test/${data.sessionId}`);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-center text-xl font-bold text-slate-800">テストのパスコードを入力</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          パスコード
          <input
            className="rounded-md border border-slate-300 px-3 py-2 notranslate"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
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
          {loading ? "確認中..." : "受験を開始する"}
        </button>
      </form>
    </main>
  );
}
