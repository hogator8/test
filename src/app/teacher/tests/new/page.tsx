"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface RowError {
  row: number;
  message: string;
}

export default function NewTestPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [passcode, setPasscode] = useState("");
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");
  const [leaveDetectionEnabled, setLeaveDetectionEnabled] = useState(true);
  const [leaveGraceSeconds, setLeaveGraceSeconds] = useState("3");
  const [leaveCountThreshold, setLeaveCountThreshold] = useState("");
  const [leaveDurationThreshold, setLeaveDurationThreshold] = useState("");
  const [leaveAction, setLeaveAction] = useState("warning_only");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMsg("問題CSVファイルを選択してください");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setRowErrors([]);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("passcode", passcode);
      formData.append("timeLimitEnabled", String(timeLimitEnabled));
      formData.append("timeLimitMinutes", timeLimitMinutes);
      formData.append("leaveDetectionEnabled", String(leaveDetectionEnabled));
      formData.append("leaveGraceSeconds", leaveGraceSeconds);
      formData.append("leaveCountThreshold", leaveCountThreshold);
      formData.append("leaveDurationThresholdSeconds", leaveDurationThreshold);
      formData.append("leaveAction", leaveAction);
      formData.append("file", file);

      const res = await fetch("/api/teacher/tests", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "作成に失敗しました");
        setRowErrors(data.errors ?? []);
        return;
      }
      router.push(`/teacher/tests/${data.testId}`);
    } catch {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800">新規テスト作成</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            テスト名
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            パスコード
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required
            />
          </label>
        </section>

        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <h2 className="font-bold text-slate-800">制限時間</h2>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={timeLimitEnabled}
              onChange={(e) => setTimeLimitEnabled(e.target.checked)}
            />
            制限時間を設定する
          </label>
          {timeLimitEnabled && (
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              制限時間(分)
              <input
                type="number"
                min={1}
                className="w-32 rounded-md border border-slate-300 px-3 py-2"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                required
              />
            </label>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <h2 className="font-bold text-slate-800">離脱検知</h2>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={leaveDetectionEnabled}
              onChange={(e) => setLeaveDetectionEnabled(e.target.checked)}
            />
            離脱検知を有効にする
          </label>

          {leaveDetectionEnabled && (
            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                許容秒数(これ未満の離脱はログのみでカウントしない)
                <input
                  type="number"
                  min={0}
                  className="w-32 rounded-md border border-slate-300 px-3 py-2"
                  value={leaveGraceSeconds}
                  onChange={(e) => setLeaveGraceSeconds(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                累計離脱回数のしきい値(空欄可)
                <input
                  type="number"
                  min={0}
                  className="w-32 rounded-md border border-slate-300 px-3 py-2"
                  value={leaveCountThreshold}
                  onChange={(e) => setLeaveCountThreshold(e.target.value)}
                  placeholder="未設定"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                累計離脱時間のしきい値(秒・空欄可)
                <input
                  type="number"
                  min={0}
                  className="w-32 rounded-md border border-slate-300 px-3 py-2"
                  value={leaveDurationThreshold}
                  onChange={(e) => setLeaveDurationThreshold(e.target.value)}
                  placeholder="未設定"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                しきい値を超えた場合の挙動
                <select
                  className="w-56 rounded-md border border-slate-300 px-3 py-2"
                  value={leaveAction}
                  onChange={(e) => setLeaveAction(e.target.value)}
                >
                  <option value="warning_only">警告のみ</option>
                  <option value="auto_pause">自動一時停止</option>
                  <option value="auto_submit">自動提出</option>
                </select>
              </label>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <h2 className="font-bold text-slate-800">問題CSVアップロード</h2>
          <p className="text-sm text-slate-600">
            フォーマット: セクション番号,問題番号,問題文,選択肢1,選択肢2,選択肢3,選択肢4,選択肢5,正答
            (ヘッダー行なし・選択肢3〜5は空欄可・正答は選択肢の列番号)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />
        </section>

        {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}
        {rowErrors.length > 0 && (
          <ul className="space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {rowErrors.map((e, i) => (
              <li key={i}>
                {e.row}行目: {e.message}
              </li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "作成中..." : "テストを作成する"}
        </button>
      </form>
    </div>
  );
}
