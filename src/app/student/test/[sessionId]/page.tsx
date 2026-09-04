"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type SessionStatus = "in_progress" | "paused" | "submitted";

interface Choice {
  index: number;
  text: string;
}

interface Question {
  id: string;
  questionNumber: number;
  questionText: string;
  choices: Choice[];
}

interface Section {
  sectionNumber: number;
  questions: Question[];
}

interface TestInfo {
  id: string;
  title: string;
  timeLimitMinutes: number | null;
  leaveDetectionEnabled: boolean;
  leaveGraceSeconds: number;
  leaveCountThreshold: number | null;
  leaveDurationThresholdSeconds: number | null;
  leaveAction: "warning_only" | "auto_pause" | "auto_submit";
}

interface SessionData {
  session: {
    id: string;
    status: SessionStatus;
    startedAt: string;
    submittedAt: string | null;
    totalScore: number | null;
    autoSubmitted: boolean;
  };
  test: TestInfo;
  sections: Section[];
  answers: Record<string, number>;
  totalQuestions: number;
  serverNow: string;
}

/**
 * Best-effort fullscreen request. iPhone Safari (and iOS Chrome, which uses
 * the same engine) does not support the Fullscreen API on arbitrary elements
 * - requestFullscreen may be missing entirely or reject/throw. Either way we
 * swallow the failure silently and let the exam continue; fullscreen is an
 * extra deterrent on devices that support it, never a requirement.
 */
async function tryRequestFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // ignore - visibilitychange-based detection remains active regardless.
  }
}

export default function StudentTestPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [data, setData] = useState<SessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [entered, setEntered] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [finalResult, setFinalResult] = useState<{ totalScore: number | null; autoSubmitted: boolean } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const leftAtRef = useRef<{ background: number | null; fullscreen: number | null }>({
    background: null,
    fullscreen: null,
  });
  const submitGuardRef = useRef(false);
  const statusRef = useRef<SessionStatus | null>(null);
  statusRef.current = status;

  useEffect(() => {
    fetch(`/api/student/session/${sessionId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "テストの読み込みに失敗しました");
        return json as SessionData;
      })
      .then((json) => {
        setData(json);
        setStatus(json.session.status);
        setAnswers(json.answers);
        if (json.session.status === "submitted") {
          setFinalResult({ totalScore: json.session.totalScore, autoSubmitted: json.session.autoSubmitted });
        }
      })
      .catch((e) => setLoadError(e.message));
  }, [sessionId]);

  const reportLeaveEvent = useCallback(
    async (eventType: "background" | "fullscreen_exit", leftAtMs: number, returnedAtMs: number) => {
      if (statusRef.current !== "in_progress") return;
      const durationSeconds = Math.max(0, (returnedAtMs - leftAtMs) / 1000);
      try {
        const res = await fetch(`/api/student/session/${sessionId}/proctoring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType,
            leftAt: new Date(leftAtMs).toISOString(),
            returnedAt: new Date(returnedAtMs).toISOString(),
            durationSeconds,
          }),
        });
        const json = await res.json();
        if (json.action === "warning") {
          setWarningOpen(true);
        } else if (json.action === "paused") {
          setStatus("paused");
        } else if (json.action === "auto_submit") {
          setStatus("submitted");
          setFinalResult({ totalScore: json.totalScore, autoSubmitted: true });
        }
      } catch {
        // Network hiccups shouldn't crash the exam; the event is still logged
        // server-side on the next successful call.
      }
    },
    [sessionId]
  );

  // Background / tab-switch detection (works on iOS Safari + Android Chrome).
  useEffect(() => {
    if (!entered || !data?.test.leaveDetectionEnabled) return;

    function handleVisibilityChange() {
      const now = Date.now();
      if (document.hidden) {
        leftAtRef.current.background = now;
      } else if (leftAtRef.current.background !== null) {
        const leftAt = leftAtRef.current.background;
        leftAtRef.current.background = null;
        reportLeaveEvent("background", leftAt, now);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [entered, data?.test.leaveDetectionEnabled, reportLeaveEvent]);

  // Fullscreen-exit detection. On devices without Fullscreen API support
  // (iPhone Safari/Chrome) this event simply never fires - that's expected,
  // not a bug; visibilitychange above remains the primary defense there.
  useEffect(() => {
    if (!entered || !data?.test.leaveDetectionEnabled) return;

    function handleFullscreenChange() {
      const now = Date.now();
      if (!document.fullscreenElement) {
        leftAtRef.current.fullscreen = now;
      } else if (leftAtRef.current.fullscreen !== null) {
        const leftAt = leftAtRef.current.fullscreen;
        leftAtRef.current.fullscreen = null;
        reportLeaveEvent("fullscreen_exit", leftAt, now);
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [entered, data?.test.leaveDetectionEnabled, reportLeaveEvent]);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submitGuardRef.current) return;
      submitGuardRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/student/session/${sessionId}/submit`, { method: "POST" });
        const json = await res.json();
        if (res.ok) {
          setStatus("submitted");
          setFinalResult({ totalScore: json.totalScore, autoSubmitted: json.autoSubmitted ?? auto });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId]
  );

  // Countdown timer (display only - the server independently enforces the deadline).
  useEffect(() => {
    if (!data || !data.test.timeLimitMinutes || status !== "in_progress") return;
    const deadlineMs = new Date(data.session.startedAt).getTime() + data.test.timeLimitMinutes * 60_000;

    function tick() {
      const remaining = Math.round((deadlineMs - Date.now()) / 1000);
      setRemainingSeconds(Math.max(0, remaining));
      if (remaining <= 0) {
        doSubmit(true);
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data, status, doSubmit]);

  async function handleEnter() {
    await tryRequestFullscreen();
    setEntered(true);
  }

  async function handleResume() {
    await tryRequestFullscreen();
    const res = await fetch(`/api/student/session/${sessionId}/resume`, { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      setStatus("in_progress");
      setEntered(true);
    } else if (json.submitted) {
      setStatus("submitted");
      setFinalResult({ totalScore: json.totalScore, autoSubmitted: true });
    }
  }

  async function handleSelect(questionId: string, choiceIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
    const res = await fetch(`/api/student/session/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, selectedChoice: choiceIndex }),
    });
    if (!res.ok) {
      const json = await res.json();
      if (json.submitted) {
        setStatus("submitted");
      }
    }
  }

  async function handleManualSubmit() {
    if (!confirm("提出すると解答を変更できません。提出しますか？")) return;
    await doSubmit(false);
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!data || !status) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <p className="text-slate-500">読み込み中...</p>
      </main>
    );
  }

  if (status === "submitted") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-bold text-slate-800 notranslate">{data.test.title}</h1>
        <p className="text-lg font-semibold text-green-700">提出が完了しました</p>
        {finalResult?.totalScore !== null && finalResult?.totalScore !== undefined && (
          <p className="text-slate-600">
            得点: {finalResult.totalScore} / {data.totalQuestions}
          </p>
        )}
        {finalResult?.autoSubmitted && (
          <p className="text-sm text-amber-600">制限時間超過または離脱により自動提出されました</p>
        )}
      </main>
    );
  }

  if (!entered) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-xl font-bold text-slate-800 notranslate">{data.test.title}</h1>
        <p className="text-slate-600">
          受験中に他のアプリやタブを開くと離脱として記録されます。対応する端末では全画面表示になります。
        </p>
        <button
          onClick={status === "paused" ? handleResume : handleEnter}
          className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow hover:bg-blue-700"
        >
          {status === "paused" ? "再開する" : "受験を開始する"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800 notranslate">{data.test.title}</h1>
        {remainingSeconds !== null && (
          <span
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              remainingSeconds < 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
            }`}
          >
            残り時間: {formatTime(remainingSeconds)}
          </span>
        )}
      </header>

      {data.sections.map((section) => (
        <section key={section.sectionNumber} className="mb-8">
          <h2 className="mb-3 text-base font-bold text-slate-700">セクション {section.sectionNumber}</h2>
          <div className="flex flex-col gap-4">
            {section.questions.map((q) => (
              <div key={q.id} className="rounded-lg bg-white p-4 shadow">
                <p className="notranslate mb-3 font-medium text-slate-800">
                  問{q.questionNumber}. {q.questionText}
                </p>
                <div className="flex flex-col gap-2">
                  {q.choices.map((c) => (
                    <label
                      key={c.index}
                      className="notranslate flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === c.index}
                        onChange={() => handleSelect(q.id, c.index)}
                      />
                      {c.text}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-2xl justify-end">
          <button
            onClick={handleManualSubmit}
            disabled={submitting}
            className="rounded-md bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "提出中..." : "提出する"}
          </button>
        </div>
      </div>

      {warningOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
            <p className="mb-4 font-semibold text-red-600">
              画面から離れたことが検知されました。受験を継続するには画面内に留まってください。
            </p>
            <button
              onClick={() => setWarningOpen(false)}
              className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {status === "paused" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
            <p className="mb-4 font-semibold text-red-600">
              離脱が検知されたため一時停止しました。再開するにはボタンを押してください。
            </p>
            <button
              onClick={handleResume}
              className="rounded-md bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              再開する
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
