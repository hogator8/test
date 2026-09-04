"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface HistoryItem {
  sessionId: string;
  testTitle: string;
  submittedAt: string;
  totalScore: number | null;
  totalQuestions: number;
  showScore: boolean;
}

export default function StudentHistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/student/history")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
        return data.history as HistoryItem[];
      })
      .then(setHistory)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">受験履歴</h1>
        <Link href="/student/passcode" className="text-sm text-blue-600 hover:underline">
          HOME
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : history.length === 0 ? (
        <p className="text-slate-500">まだ提出したテストはありません</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((h) => {
            const inner = (
              <>
                <p className="notranslate font-semibold text-slate-800">{h.testTitle}</p>
                <p className="text-sm text-slate-500">{new Date(h.submittedAt).toLocaleString("ja-JP")}</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {h.showScore ? `得点: ${h.totalScore ?? "-"} / ${h.totalQuestions}` : "得点非公開"}
                </p>
              </>
            );
            return (
              <li key={h.sessionId} className="rounded-lg bg-white p-4 shadow">
                {h.showScore ? (
                  <Link href={`/student/history/${h.sessionId}`} className="block hover:opacity-80">
                    {inner}
                  </Link>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
