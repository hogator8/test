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

  useEffect(() => {
    fetch("/api/teacher/tests")
      .then((res) => res.json())
      .then((data) => setTests(data.tests ?? []))
      .finally(() => setLoading(false));
  }, []);

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
                      <Link href={`/teacher/tests/${t.id}`} className="text-blue-600 hover:underline">
                        詳細
                      </Link>
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
