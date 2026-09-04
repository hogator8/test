"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TestSummary {
  id: string;
  title: string;
  passcode: string;
  time_limit_minutes: number | null;
  created_at: string;
  questions: number;
  sessions: number;
}

export default function TeacherTestsPage() {
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadTests() {
    setLoading(true);
    return fetch("/api/teacher/tests")
      .then((res) => res.json())
      .then((data) => setTests(data.tests ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTests();
  }, []);

  async function handleDelete(t: TestSummary) {
    const confirmed = confirm(
      `「${t.title}」を削除しますか?\n受験者数: ${t.sessions}名\nこのテストに紐づく問題・受験セッション・解答・離脱ログもすべて削除され、元に戻せません。`
    );
    if (!confirmed) return;

    setDeletingId(t.id);
    try {
      const res = await fetch(`/api/teacher/tests/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      await loadTests();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">テスト一覧</h1>
        <Link
          href="/teacher/tests/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          新規テスト作成
        </Link>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        {loading ? (
          <p className="text-slate-500">読み込み中...</p>
        ) : tests.length === 0 ? (
          <p className="text-slate-500">テストはまだ作成されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">テスト名</th>
                  <th className="py-2 pr-4">パスコード</th>
                  <th className="py-2 pr-4">制限時間</th>
                  <th className="py-2 pr-4">問題数</th>
                  <th className="py-2 pr-4">受験数</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium notranslate">{t.title}</td>
                    <td className="py-2 pr-4 notranslate">{t.passcode}</td>
                    <td className="py-2 pr-4">
                      {t.time_limit_minutes ? `${t.time_limit_minutes}分` : "なし"}
                    </td>
                    <td className="py-2 pr-4">{t.questions}</td>
                    <td className="py-2 pr-4">{t.sessions}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/teacher/tests/${t.id}`} className="text-blue-600 hover:underline">
                          詳細
                        </Link>
                        <Link href={`/teacher/tests/${t.id}/edit`} className="text-blue-600 hover:underline">
                          編集
                        </Link>
                        <button
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === t.id ? "削除中..." : "削除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
