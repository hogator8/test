"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SessionRow {
  id: string;
  studentId: string;
  studentName: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number | null;
  autoSubmitted: boolean;
  leaveCount: number;
  leaveDurationSeconds: number;
}

interface TestDetail {
  id: string;
  title: string;
  passcode: string;
  time_limit_minutes: number | null;
  leave_detection_enabled: boolean;
  leave_grace_seconds: number;
  leave_count_threshold: number | null;
  leave_duration_threshold_seconds: number | null;
  leave_action: string;
}

const statusLabel: Record<string, string> = {
  in_progress: "受験中",
  paused: "一時停止",
  submitted: "提出済み",
};

const leaveActionLabel: Record<string, string> = {
  warning_only: "警告のみ",
  auto_pause: "自動一時停止",
  auto_submit: "自動提出",
};

export default function TeacherTestDetailPage() {
  const params = useParams<{ id: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [includeAll, setIncludeAll] = useState(false);

  useEffect(() => {
    fetch(`/api/teacher/tests/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setTest(data.test);
        setSessions(data.sessions ?? []);
        setTotalQuestions(data.totalQuestions ?? 0);
        setTotalStudents(data.totalStudents ?? 0);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p className="text-slate-500">読み込み中...</p>;
  if (!test) return <p className="text-red-600">テストが見つかりません</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 notranslate">{test.title}</h1>
        <p className="text-sm text-slate-500 notranslate">パスコード: {test.passcode}</p>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded-lg bg-white p-6 shadow sm:grid-cols-4">
        <Stat label="問題数" value={`${totalQuestions}問`} />
        <Stat label="制限時間" value={test.time_limit_minutes ? `${test.time_limit_minutes}分` : "なし"} />
        <Stat label="受験数" value={`${sessions.length} / ${totalStudents}名`} />
        <Stat
          label="離脱検知"
          value={test.leave_detection_enabled ? leaveActionLabel[test.leave_action] : "無効"}
        />
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800">受験状況</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeAll}
                onChange={(e) => setIncludeAll(e.target.checked)}
              />
              未受験の学生も出力する
            </label>
            <a
              href={`/api/teacher/tests/${params.id}/export?includeAll=${includeAll}`}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              回答CSVをダウンロード
            </a>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-slate-500">まだ受験者はいません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">学生ID</th>
                  <th className="py-2 pr-4">氏名</th>
                  <th className="py-2 pr-4">ステータス</th>
                  <th className="py-2 pr-4">得点</th>
                  <th className="py-2 pr-4">開始</th>
                  <th className="py-2 pr-4">提出</th>
                  <th className="py-2 pr-4">離脱回数</th>
                  <th className="py-2 pr-4">離脱合計(秒)</th>
                  <th className="py-2 pr-4">自動提出</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 notranslate">{s.studentId}</td>
                    <td className="py-2 pr-4 notranslate">{s.studentName}</td>
                    <td className="py-2 pr-4">{statusLabel[s.status] ?? s.status}</td>
                    <td className="py-2 pr-4">
                      {s.totalScore ?? "-"}
                      {s.totalScore !== null ? ` / ${totalQuestions}` : ""}
                    </td>
                    <td className="py-2 pr-4">{new Date(s.startedAt).toLocaleString("ja-JP")}</td>
                    <td className="py-2 pr-4">
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString("ja-JP") : "-"}
                    </td>
                    <td className="py-2 pr-4">{s.leaveCount}</td>
                    <td className="py-2 pr-4">{s.leaveDurationSeconds}</td>
                    <td className="py-2 pr-4">{s.autoSubmitted ? "はい" : "いいえ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}
