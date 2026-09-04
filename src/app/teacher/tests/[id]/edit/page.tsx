"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  leave_warning_message: string | null;
  pause_release_pin: string | null;
}

export default function EditTestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [passcode, setPasscode] = useState("");
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");
  const [leaveDetectionEnabled, setLeaveDetectionEnabled] = useState(true);
  const [leaveGraceSeconds, setLeaveGraceSeconds] = useState("3");
  const [leaveCountThreshold, setLeaveCountThreshold] = useState("");
  const [leaveDurationThreshold, setLeaveDurationThreshold] = useState("");
  const [leaveAction, setLeaveAction] = useState("warning_only");
  const [leaveWarningMessage, setLeaveWarningMessage] = useState("");
  const [pauseReleasePin, setPauseReleasePin] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/tests/${params.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "テストの読み込みに失敗しました");
        return data.test as TestDetail;
      })
      .then((test) => {
        setTitle(test.title);
        setPasscode(test.passcode);
        setTimeLimitEnabled(test.time_limit_minutes !== null);
        setTimeLimitMinutes(test.time_limit_minutes ? String(test.time_limit_minutes) : "30");
        setLeaveDetectionEnabled(test.leave_detection_enabled);
        setLeaveGraceSeconds(String(test.leave_grace_seconds));
        setLeaveCountThreshold(
          test.leave_count_threshold !== null ? String(test.leave_count_threshold) : ""
        );
        setLeaveDurationThreshold(
          test.leave_duration_threshold_seconds !== null
            ? String(test.leave_duration_threshold_seconds)
            : ""
        );
        setLeaveAction(test.leave_action);
        setLeaveWarningMessage(test.leave_warning_message ?? "");
        setPauseReleasePin(test.pause_release_pin ?? "");
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/teacher/tests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          passcode,
          timeLimitEnabled,
          timeLimitMinutes,
          leaveDetectionEnabled,
          leaveGraceSeconds,
          leaveCountThreshold,
          leaveDurationThresholdSeconds: leaveDurationThreshold,
          leaveAction,
          leaveWarningMessage,
          pauseReleasePin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "更新に失敗しました");
        return;
      }
      router.push(`/teacher/tests/${params.id}`);
    } catch {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-slate-500">読み込み中...</p>;
  if (loadError) return <p className="text-red-600">{loadError}</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800">テスト設定を編集</h1>
      <p className="text-sm text-slate-600">
        問題データ(問題文・選択肢・正答)自体は編集できません。問題内容を変更したい場合は、テストを削除して作り直してください。
      </p>

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
              {leaveAction === "auto_pause" && (
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

        <p className="text-sm text-slate-500">
          既に受験セッションが存在する場合、ここでの変更は今後の判定にのみ反映され、過去に記録された離脱ログ等は書き換えられません。
        </p>

        {errorMsg && <p className="text-sm font-medium text-red-600">{errorMsg}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "保存中..." : "変更を保存する"}
        </button>
      </form>
    </div>
  );
}
