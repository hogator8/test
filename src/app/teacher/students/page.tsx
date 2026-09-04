"use client";

import { useEffect, useRef, useState } from "react";

interface Student {
  id: string;
  student_id: string;
  name: string;
  created_at: string;
}

interface RowError {
  row: number;
  message: string;
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/students");
      const data = await res.json();
      setStudents(data.students ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMsg("CSVファイルを選択してください");
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setRowErrors([]);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/teacher/students/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "アップロードに失敗しました");
        setRowErrors(data.errors ?? []);
        return;
      }
      setSuccessMsg(`${data.count}件の学生を登録しました`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadStudents();
    } catch {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold text-slate-800">学生CSV一括登録</h2>
        <p className="mb-4 text-sm text-slate-600">
          フォーマット: 1行につき「学生ID,氏名,パスワード」(ヘッダー行なし・UTF-8 BOM付き推奨)
        </p>
        <form onSubmit={handleUpload} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            type="submit"
            disabled={uploading}
            className="whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? "アップロード中..." : "アップロード"}
          </button>
        </form>

        {errorMsg && <p className="mt-4 text-sm font-medium text-red-600">{errorMsg}</p>}
        {successMsg && <p className="mt-4 text-sm font-medium text-green-600">{successMsg}</p>}
        {rowErrors.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {rowErrors.map((e, i) => (
              <li key={i}>
                {e.row}行目: {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold text-slate-800">登録済み学生一覧 ({students.length}名)</h2>
        {loading ? (
          <p className="text-slate-500">読み込み中...</p>
        ) : students.length === 0 ? (
          <p className="text-slate-500">登録済みの学生はいません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">学生ID</th>
                  <th className="py-2 pr-4">氏名</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 notranslate">
                    <td className="py-2 pr-4">{s.student_id}</td>
                    <td className="py-2 pr-4">{s.name}</td>
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
