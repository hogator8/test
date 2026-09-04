"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Choice {
  index: number;
  text: string;
}

interface QuestionFeedback {
  id: string;
  questionNumber: number;
  questionText: string;
  choices: Choice[];
  selectedChoice: number | null;
  correctChoice: number;
  isCorrect: boolean;
}

interface SectionFeedback {
  sectionNumber: number;
  questions: QuestionFeedback[];
}

interface HistoryDetail {
  testTitle: string;
  submittedAt: string;
  totalScore: number | null;
  totalQuestions: number;
  sections: SectionFeedback[];
}

export default function StudentHistoryDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const [data, setData] = useState<HistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/student/history/${params.sessionId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "読み込みに失敗しました");
        return json as HistoryDetail;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [params.sessionId]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 text-center">
        <p className="text-red-600">{error}</p>
        <Link href="/student/history" className="mt-4 inline-block text-blue-600 hover:underline">
          受験履歴に戻る
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-slate-500">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="notranslate text-xl font-bold text-slate-800">{data.testTitle}</h1>
          <p className="text-sm text-slate-500">
            {new Date(data.submittedAt).toLocaleString("ja-JP")} ・ 得点: {data.totalScore ?? "-"} /{" "}
            {data.totalQuestions}
          </p>
        </div>
        <Link href="/student/history" className="text-sm text-blue-600 hover:underline">
          一覧に戻る
        </Link>
      </div>

      {data.sections.map((section) => (
        <section key={section.sectionNumber} className="mb-8">
          <h2 className="mb-3 text-base font-bold text-slate-700">セクション {section.sectionNumber}</h2>
          <div className="flex flex-col gap-4">
            {section.questions.map((q) => (
              <div
                key={q.id}
                className={`rounded-lg p-4 shadow ${q.isCorrect ? "bg-green-50" : "bg-red-50"}`}
              >
                <p className="notranslate mb-3 font-medium text-slate-800">
                  問{q.questionNumber}. {q.questionText}
                </p>
                <div className="flex flex-col gap-2">
                  {q.choices.map((c) => {
                    const isSelected = q.selectedChoice === c.index;
                    const isCorrectChoice = q.correctChoice === c.index;
                    return (
                      <div
                        key={c.index}
                        className={`notranslate flex items-center justify-between rounded-md border px-3 py-2 ${
                          isCorrectChoice
                            ? "border-green-400 bg-green-100"
                            : isSelected
                              ? "border-red-400 bg-red-100"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <span>{c.text}</span>
                        <span className="flex gap-2 text-xs font-semibold">
                          {isSelected && <span className="text-slate-600">あなたの解答</span>}
                          {isCorrectChoice && <span className="text-green-700">正解</span>}
                        </span>
                      </div>
                    );
                  })}
                  {q.selectedChoice === null && (
                    <p className="text-xs font-semibold text-red-600">未回答でした</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
