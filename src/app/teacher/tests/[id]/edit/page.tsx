"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StagedActionsEditor } from "@/components/StagedActionsEditor";
import { QuestionText } from "@/components/QuestionText";
import { normalizeStagedActions, LeaveStage } from "@/lib/leaveStages";

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
  // Raw jsonb column - may be the legacy string-array format. Always run
  // through normalizeStagedActions() before use.
  leave_staged_actions: unknown;
  leave_warning_message: string | null;
  pause_release_pin: string | null;
  start_screen_message: string | null;
  show_score_to_student: boolean;
}

interface RowError {
  row: number;
  message: string;
}

interface RegisteredQuestion {
  id: string;
  sectionNumber: number;
  questionNumber: number;
  points: number;
  questionText: string;
  questionType: string;
  choices: { index: number; text: string }[];
  correctAnswer: number | null;
  freeTextAnswers: string[];
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
  const [leaveStagedMode, setLeaveStagedMode] = useState(false);
  const [stagedActions, setStagedActions] = useState<LeaveStage[]>([
    { action: "warning_only", count_threshold: 1, duration_threshold_seconds: null },
  ]);
  const [leaveWarningMessage, setLeaveWarningMessage] = useState("");
  const [pauseReleasePin, setPauseReleasePin] = useState("");
  const [startScreenMessage, setStartScreenMessage] = useState("");
  const [showScoreToStudent, setShowScoreToStudent] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sessionCount, setSessionCount] = useState(0);
  const [questions, setQuestions] = useState<RegisteredQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceErrorMsg, setReplaceErrorMsg] = useState<string | null>(null);
  const [replaceRowErrors, setReplaceRowErrors] = useState<RowError[]>([]);
  const [replaceSuccessMsg, setReplaceSuccessMsg] = useState<string | null>(null);

  function loadQuestions() {
    setQuestionsLoading(true);
    setQuestionsError(null);
    fetch(`/api/teacher/tests/${params.id}/questions`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "問題の読み込みに失敗しました");
        setQuestions(data.questions as RegisteredQuestion[]);
      })
      .catch((e) => setQuestionsError(e.message))
      .finally(() => setQuestionsLoading(false));
  }

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    fetch(`/api/teacher/tests/${params.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "テストの読み込みに失敗しました");
        setSessionCount((data.sessions ?? []).length);
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
        const normalizedStages = normalizeStagedActions(test.leave_staged_actions);
        setLeaveStagedMode(!!normalizedStages && normalizedStages.length > 0);
        setStagedActions(
          normalizedStages && normalizedStages.length > 0
            ? normalizedStages
            : [{ action: "warning_only", count_threshold: 1, duration_threshold_seconds: null }]
        );
        setLeaveWarningMessage(test.leave_warning_message ?? "");
        setPauseReleasePin(test.pause_release_pin ?? "");
        setStartScreenMessage(test.start_screen_message ?? "");
        setShowScoreToStudent(test.show_score_to_student);
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
          leaveStagedMode,
          leaveStagedActions: stagedActions,
          leaveWarningMessage,
          pauseReleasePin,
          startScreenMessage,
          showScoreToStudent,
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

  async function handleReplaceQuestions(e: React.FormEvent) {
    e.preventDefault();
    const file = replaceFileInputRef.current?.files?.[0];
    if (!file) {
      setReplaceErrorMsg("問題CSVファイルを選択してください");
      return;
    }

    setReplacing(true);
    setReplaceErrorMsg(null);
    setReplaceRowErrors([]);
    setReplaceSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/teacher/tests/${params.id}/questions`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setReplaceErrorMsg(data.error ?? "問題の差し替えに失敗しました");
        setReplaceRowErrors(data.errors ?? []);
        return;
      }
      setReplaceSuccessMsg(
        `問題を更新しました(登録: ${data.count}件、削除: ${data.removed}件)。既に回答済みの学生の採点結果は変わりません。`
      );
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
      loadQuestions();
    } catch {
      setReplaceErrorMsg("通信エラーが発生しました");
    } finally {
      setReplacing(false);
    }
  }

  if (loading) return <p className="text-slate-500">読み込み中...</p>;
  if (loadError) return <p className="text-red-600">{loadError}</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800">テスト設定を編集</h1>

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

      <section className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow">
        <h2 className="font-bold text-slate-800">登録済みの問題</h2>

        {sessionCount > 0 && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            既に{sessionCount}人が回答済みです。変更内容は今後の判定にのみ反映され、既に回答済みの学生の採点結果は変わりません。
          </p>
        )}

        {questionsLoading && <p className="text-sm text-slate-500">読み込み中...</p>}
        {questionsError && <p className="text-sm text-red-600">{questionsError}</p>}

        {!questionsLoading && !questionsError && (
          <div className="flex flex-col gap-4">
            {Object.entries(
              questions.reduce<Record<number, RegisteredQuestion[]>>((acc, q) => {
                (acc[q.sectionNumber] ??= []).push(q);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([sectionNumber, qs]) => (
                <div key={sectionNumber} className="flex flex-col gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                  <h3 className="text-sm font-semibold text-slate-600">セクション{sectionNumber}</h3>
                  {qs
                    .sort((a, b) => a.questionNumber - b.questionNumber)
                    .map((q) => (
                      <div key={q.id} className="rounded-md border border-slate-200 p-3 text-sm">
                        <p className="font-medium text-slate-800">
                          問{q.questionNumber}({q.points}点). <QuestionText text={q.questionText} />
                        </p>
                        {q.questionType === "free_text" ? (
                          <p className="mt-1 text-slate-600">
                            (自由記述・正答例: {q.freeTextAnswers.join(" / ")})
                          </p>
                        ) : (
                          <ul className="mt-1 flex flex-col gap-0.5 text-slate-600">
                            {q.choices.map((c) => (
                              <li key={c.index} className={c.index === q.correctAnswer ? "font-semibold text-green-700" : ""}>
                                {c.index}. <QuestionText text={c.text} />
                                {c.index === q.correctAnswer ? "(正答)" : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            {questions.length === 0 && <p className="text-sm text-slate-500">問題が登録されていません。</p>}
          </div>
        )}

        <form onSubmit={handleReplaceQuestions} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">問題を差し替える</h3>
            <a href="/api/teacher/tests/questions-template" className="text-sm text-blue-600 hover:underline">
              テンプレートをダウンロード
            </a>
          </div>
          <p className="text-sm text-slate-600">
            新しい問題CSVをアップロードすると、既存の問題は内容が更新され、CSVに含まれない問題は削除されます(過去の回答データは保持されます)。
            点数を変更した場合も、既に提出済みの学生の得点は変わらず、以降の判定にのみ反映されます。
          </p>
          <input ref={replaceFileInputRef} type="file" accept=".csv" className="text-sm" />
          {replaceErrorMsg && <p className="text-sm font-medium text-red-600">{replaceErrorMsg}</p>}
          {replaceRowErrors.length > 0 && (
            <ul className="space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {replaceRowErrors.map((e, i) => (
                <li key={i}>
                  {e.row}行目: {e.message}
                </li>
              ))}
            </ul>
          )}
          {replaceSuccessMsg && <p className="text-sm font-medium text-green-700">{replaceSuccessMsg}</p>}
          <button
            type="submit"
            disabled={replacing}
            className="self-start rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {replacing ? "アップロード中..." : "問題を差し替える"}
          </button>
        </form>
      </section>
    </div>
  );
}
