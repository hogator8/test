"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TestOption {
  organizationId: string;
  title: string;
}

export default function StudentPasscodePage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<TestOption[] | null>(null);
  const router = useRouter();

  async function submitPasscode(organizationId?: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/student/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, organizationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "パスコードが正しくありません");
        setOptions(null);
        return;
      }
      if (data.needsSelection) {
        setOptions(data.options ?? []);
        return;
      }
      router.push(`/student/test/${data.sessionId}`);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitPasscode();
  }

  if (options) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <h1 className="mb-6 text-center text-xl font-bold text-slate-800">
          同じパスコードのテストが複数見つかりました
        </h1>
        <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-slate-600">受験するテストを選んでください</p>
          {options.map((opt) => (
            <button
              key={opt.organizationId}
              type="button"
              disabled={loading}
              onClick={() => submitPasscode(opt.organizationId)}
              className="notranslate rounded-md border border-slate-300 px-4 py-3 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {opt.title}
            </button>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => setOptions(null)}
            className="mt-2 text-sm text-slate-500 hover:underline"
          >
            戻る
          </button>
        </div>
      </main>
    );
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
      <Link href="/student/history" className="mt-4 text-center text-sm text-blue-600 hover:underline">
        受験履歴を見る
      </Link>
    </main>
  );
}
