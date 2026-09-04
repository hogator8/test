"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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

type SortKey = "studentId" | "studentName" | "status" | "totalScore" | "startedAt" | "submittedAt" | "leaveCount";

const sortColumns: { key: SortKey; label: string }[] = [
  { key: "studentId", label: "学生ID" },
  { key: "studentName", label: "氏名" },
  { key: "status", label: "ステータス" },
  { key: "totalScore", label: "得点" },
  { key: "startedAt", label: "開始" },
  { key: "submittedAt", label: "提出" },
  { key: "leaveCount", label: "離脱回数" },
];

function sortValue(s: SessionRow, key: SortKey): string | number {
  switch (key) {
    case "totalScore":
      return s.totalScore ?? -1;
    case "startedAt":
      return s.startedAt ?? "";
    case "submittedAt":
      return s.submittedAt ?? "";
    case "leaveCount":
      return s.leaveCount;
    case "status":
      return statusLabel[s.status] ?? s.status;
    default:
      return s[key];
  }
}

export default function TeacherTestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [includeAll, setIncludeAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadTest = useCallback(() => {
    return fetch(`/api/teacher/tests/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setTest(data.test);
        setSessions(data.sessions ?? []);
        setTotalQuestions(data.totalQuestions ?? 0);
        setTotalStudents(data.totalStudents ?? 0);
      });
  }, [params.id]);

  useEffect(() => {
    loadTest().finally(() => setLoading(false));
  }, [loadTest]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const visibleSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (query && !s.studentId.toLowerCase().includes(query) && !s.studentName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [sessions, statusFilter, searchQuery, sortKey, sortAsc]);

  async function handleDeleteSession(s: SessionRow) {
    const confirmed = confirm(
      `学生「${s.studentName}」(${s.studentId})の受験記録を削除しますか?\n削除後、この学生は同じテストを再度パスコードで受験できるようになります。\n解答・離脱ログの履歴は残り、回答CSVエクスポートには引き続き出力されます。`
    );
    if (!confirmed) return;

    setDeletingSessionId(s.id);
    try {
      const res = await fetch(`/api/teacher/tests/${params.id}/sessions/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      await loadTest();
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function handleDelete() {
    if (!test) return;
    const confirmed = confirm(
      `「${test.title}」を削除しますか?\n受験者数: ${sessions.length}名\nこのテストに紐づく問題・受験セッション・解答・離脱ログもすべて削除され、元に戻せません。`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/teacher/tests/${params.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      router.push("/teacher/tests");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-slate-500">読み込み中...</p>;
  if (!test) return <p className="text-red-600">テストが見つかりません</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 notranslate">{test.title}</h1>
          <p className="text-sm text-slate-500 notranslate">パスコード: {test.passcode}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/teacher/tests/${params.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            設定を編集
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "削除中..." : "テストを削除"}
          </button>
        </div>
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

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="学生ID・氏名で検索"
            className="notranslate rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="all">すべてのステータス</option>
            <option value="in_progress">受験中</option>
            <option value="paused">一時停止</option>
            <option value="submitted">提出済み</option>
          </select>
        </div>

        {sessions.length === 0 ? (
          <p className="text-slate-500">まだ受験者はいません</p>
        ) : visibleSessions.length === 0 ? (
          <p className="text-slate-500">条件に一致する受験者はいません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  {sortColumns.map((col) => (
                    <th key={col.key} className="py-2 pr-4">
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 font-medium hover:text-slate-800"
                      >
                        {col.label}
                        {sortKey === col.key && <span>{sortAsc ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="py-2 pr-4">離脱合計(秒)</th>
                  <th className="py-2 pr-4">自動提出</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s) => (
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
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => handleDeleteSession(s)}
                        disabled={deletingSessionId === s.id}
                        className="text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingSessionId === s.id ? "削除中..." : "削除"}
                      </button>
                    </td>
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
