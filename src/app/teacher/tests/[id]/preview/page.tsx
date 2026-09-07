"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QuestionText } from "@/components/QuestionText";

interface Choice {
  index: number;
  text: string;
}

interface PreviewQuestion {
  id: string;
  sectionNumber: number;
  questionNumber: number;
  questionText: string;
  questionType: string;
  choices: Choice[];
}

interface TestInfo {
  title: string;
  time_limit_minutes: number | null;
  leave_warning_message: string | null;
  start_screen_message: string | null;
}

const DEFAULT_WARNING_MESSAGE =
  "画面から離れたことが検知されました。受験を継続するには画面内に留まってください。";
const DEFAULT_START_MESSAGE =
  "受験中に他のアプリやタブを開くと離脱として記録されます。対応する端末では全画面表示になります。";

/**
 * Mirrors the student exam UI so teachers can check rendering (furigana,
 * blanks, free-text, up to 10 choices) before students take the test. This
 * screen never calls any answer/submit/proctoring API - all state here is
 * local and discarded on navigation.
 */
export default function PreviewTestPage() {
  const params = useParams<{ id: string }>();

  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/teacher/tests/${params.id}`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "テストの読み込みに失敗しました");
        return data.test as TestInfo;
      }),
      fetch(`/api/teacher/tests/${params.id}/questions`).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "問題の読み込みに失敗しました");
        return data.questions as PreviewQuestion[];
      }),
    ])
      .then(([t, qs]) => {
        setTest(t);
        setQuestions(qs);
      })
      .catch((e) => setLoadError(e.message));
  }, [params.id]);

  useEffect(() => {
    if (!entered || !test?.time_limit_minutes) return;
    setRemainingSeconds(test.time_limit_minutes * 60);
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [entered, test?.time_limit_minutes]);

  const previewBanner = (
    <div className="bg-amber-500 px-4 py-1 text-center text-xs font-semibold text-white">
      プレビューモード - この画面での操作は保存されません
    </div>
  );

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!test) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <p className="text-slate-500">読み込み中...</p>
      </main>
    );
  }

  const sectionsMap = new Map<number, PreviewQuestion[]>();
  for (const q of questions) {
    if (!sectionsMap.has(q.sectionNumber)) sectionsMap.set(q.sectionNumber, []);
    sectionsMap.get(q.sectionNumber)!.push(q);
  }
  const sections = Array.from(sectionsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([sectionNumber, qs]) => ({
      sectionNumber,
      questions: [...qs].sort((a, b) => a.questionNumber - b.questionNumber),
    }));

  if (!entered) {
    return (
      <>
        {previewBanner}
        <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="text-xl font-bold text-slate-800 notranslate">{test.title}</h1>
          <p className="text-slate-600">{test.start_screen_message || DEFAULT_START_MESSAGE}</p>
          <button
            onClick={() => setEntered(true)}
            className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow hover:bg-blue-700"
          >
            START
          </button>
          <Link href={`/teacher/tests/${params.id}`} className="text-sm text-slate-500 hover:underline">
            テスト詳細に戻る
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      {previewBanner}
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between bg-slate-50/95 px-4 py-3 shadow-sm backdrop-blur">
          <h1 className="text-lg font-bold text-slate-800 notranslate">{test.title}</h1>
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

        {sections.map((section) => (
          <section key={section.sectionNumber} className="mb-8">
            <h2 className="mb-3 text-base font-bold text-slate-700">セクション {section.sectionNumber}</h2>
            <div className="flex flex-col gap-4">
              {section.questions.map((q) => (
                <div key={q.id} className="rounded-lg bg-white p-4 shadow">
                  <p className="mb-3 font-medium text-slate-800">
                    問{q.questionNumber}. <QuestionText text={q.questionText} />
                  </p>
                  {q.questionType === "free_text" ? (
                    <input
                      type="text"
                      className="notranslate w-full rounded-md border border-slate-300 px-3 py-2"
                      value={(answers[q.id] as string) ?? ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder="回答を入力"
                    />
                  ) : (
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
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: c.index }))}
                          />
                          <QuestionText text={c.text} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <button onClick={() => setWarningOpen(true)} className="text-xs text-slate-400 hover:underline">
              離脱警告画面を確認
            </button>
            <button
              onClick={() => setConfirmSubmitOpen(true)}
              className="rounded-md bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              SEND
            </button>
          </div>
        </div>

        {confirmSubmitOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
              <p className="mb-6 text-slate-800">
                提出すると回答を変更できません。提出しますか？
                <br />
                Once submitted, you cannot change your answers. Submit now?
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="rounded-md border border-slate-300 px-5 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="rounded-md bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  SEND
                </button>
              </div>
            </div>
          </div>
        )}

        {warningOpen && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-red-600 p-6 text-center">
            <svg
              className="h-16 w-16 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <p className="max-w-md text-xl font-bold leading-relaxed text-white">
              {test.leave_warning_message || DEFAULT_WARNING_MESSAGE}
            </p>
            <button
              onClick={() => setWarningOpen(false)}
              className="rounded-md bg-white px-6 py-3 font-bold text-red-600 shadow hover:bg-red-50"
            >
              CLOSE
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
