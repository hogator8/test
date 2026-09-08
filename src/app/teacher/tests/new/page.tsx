"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StagedActionsEditor } from "@/components/StagedActionsEditor";
import { ClassPicker } from "@/components/ClassPicker";
import type { LeaveStage } from "@/lib/leaveStages";

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
  const [leaveStagedMode, setLeaveStagedMode] = useState(false);
  const [stagedActions, setStagedActions] = useState<LeaveStage[]>([
    { action: "warning_only", count_threshold: 1, duration_threshold_seconds: null },
  ]);
  const [leaveWarningMessage, setLeaveWarningMessage] = useState("");
  const [pauseReleasePin, setPauseReleasePin] = useState("");
  const [startScreenMessage, setStartScreenMessage] = useState("");
  const [showScoreToStudent, setShowScoreToStudent] = useState(true);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/students/classes")
      .then((res) => res.json())
      .then((data) => setAvailableClasses(data.classNames ?? []))
      .catch(() => {});
  }, []);
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
      formData.append("leaveStagedMode", String(leaveStagedMode));
      formData.append("leaveStagedActions", JSON.stringify(stagedActions));
      formData.append("leaveWarningMessage", leaveWarningMessage);
      formData.append("pauseReleasePin", pauseReleasePin);
      formData.append("startScreenMessage", startScreenMessage);
      formData.append("showScoreToStudent", String(showScoreToStudent));
      formData.append("assignedClasses", JSON.stringify(assignedClasses));
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
          <h2 className="font-bold text-slate-800">対象クラス</h2>
          <ClassPicker availableClasses={availableClasses} selectedClasses={assignedClasses} onChange={setAssignedClasses} />
        </section>

        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <h2 className="font-bold text-slate-800">受験開始画面・得点表示</h2>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            案内文言(任意・未入力の場合はデフォルト文言を表示)
            <textarea
              className="rounded-md border border-slate-300 px-3 py-2"
              rows={2}
              value={startScreenMessage}
              onChange={(e) => setStartScreenMessage(e.target.value)}
              placeholder="受験中に他のアプリやタブを開くと離脱として記録されます。対応する端末では全画面表示になります。"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showScoreToStudent}
              onChange={(e) => setShowScoreToStudent(e.target.checked)}
            />
            提出後、学生に得点を表示する
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
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={leaveStagedMode}
                  onChange={(e) => setLeaveStagedMode(e.target.checked)}
                />
                段階的に設定する(離脱の発生回数ごとに挙動を変える)
              </label>

              {leaveStagedMode ? (
                <StagedActionsEditor stagedActions={stagedActions} onChange={setStagedActions} />
              ) : (
                <>
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
                </>
              )}

              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                離脱警告メッセージ(任意・未入力の場合はデフォルト文言を表示)
                <textarea
                  className="rounded-md border border-slate-300 px-3 py-2"
                  rows={2}
                  value={leaveWarningMessage}
                  onChange={(e) => setLeaveWarningMessage(e.target.value)}
                  placeholder="画面から離れたことが検知されました。受験を継続するには画面内に留まってください。"
                />
              </label>
              {(leaveStagedMode
                ? stagedActions.some((s) => s.action === "auto_pause")
                : leaveAction === "auto_pause") && (
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  一時停止解除用PIN(4桁の数字・教員が端末で直接入力して解除します)
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    className="w-32 rounded-md border border-slate-300 px-3 py-2 notranslate"
                    value={pauseReleasePin}
                    onChange={(e) => setPauseReleasePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                    required
                  />
                </label>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">問題CSVアップロード</h2>
            <a href="/api/teacher/tests/questions-template" className="text-sm text-blue-600 hover:underline">
              テンプレートをダウンロード
            </a>
          </div>
          <p className="text-sm text-slate-600">
            フォーマット: 1行目はヘッダー行「セクション番号,問題番号,点数,問題文,選択肢1〜10,正答,記述正答1〜5」、
            2行目以降にデータを入力してください。点数は1以上の整数(空欄の場合は1点)、選択肢は2〜10個(未使用列は空欄)、
            正答は選択肢の列番号です。選択肢をすべて空欄にして記述正答1のみ入力すると記述式問題になります。
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
