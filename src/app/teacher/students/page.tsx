"use client";

import { useEffect, useRef, useState } from "react";

interface Student {
  id: string;
  student_id: string;
  name: string;
  class_name: string | null;
  reading: string | null;
  nationality: string | null;
  gender: string | null;
  created_at: string;
  sessionCount: number;
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
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(s: Student) {
    const warning =
      s.sessionCount > 0
        ? `この学生には受験記録が${s.sessionCount}件あります。削除するとこの学生の受験記録・回答・離脱ログもすべて削除されます。`
        : "";
    const confirmed = confirm(
      `学生「${s.name}」(${s.student_id})を削除しますか?\n${warning}\nこの操作は元に戻せません。`
    );
    if (!confirmed) return;

    setDeletingId(s.id);
    try {
      const res = await fetch(`/api/teacher/students/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      await loadStudents();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold text-slate-800">学生CSV一括登録</h2>
        <p className="mb-4 text-sm text-slate-600">
          フォーマット: 1行目はヘッダー行「学生ID,氏名,パスワード,クラス名,読み方,国籍,性別」、2行目以降にデータを入力してください(末尾4列は空欄可・UTF-8
          BOM付き推奨)
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
                  <th className="py-2 pr-4">クラス名</th>
                  <th className="py-2 pr-4">読み方</th>
                  <th className="py-2 pr-4">国籍</th>
                  <th className="py-2 pr-4">性別</th>
                  <th className="py-2 pr-4">受験記録</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 notranslate">{s.student_id}</td>
                    <td className="py-2 pr-4 notranslate">{s.name}</td>
                    <td className="py-2 pr-4 notranslate">{s.class_name ?? "-"}</td>
                    <td className="py-2 pr-4 notranslate">{s.reading ?? "-"}</td>
                    <td className="py-2 pr-4 notranslate">{s.nationality ?? "-"}</td>
                    <td className="py-2 pr-4 notranslate">{s.gender ?? "-"}</td>
                    <td className="py-2 pr-4">{s.sessionCount}件</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditingStudent(s)}
                          className="text-blue-600 hover:underline"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          disabled={deletingId === s.id}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === s.id ? "削除中..." : "削除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingStudent && (
        <EditStudentDialog
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSaved={async () => {
            setEditingStudent(null);
            await loadStudents();
          }}
        />
      )}
    </div>
  );
}

function EditStudentDialog({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState(student.student_id);
  const [name, setName] = useState(student.name);
  const [password, setPassword] = useState("");
  const [className, setClassName] = useState(student.class_name ?? "");
  const [reading, setReading] = useState(student.reading ?? "");
  const [nationality, setNationality] = useState(student.nationality ?? "");
  const [gender, setGender] = useState(student.gender ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          name,
          password: password || undefined,
          className,
          reading,
          nationality,
          gender,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "更新に失敗しました");
        return;
      }
      onSaved();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-bold text-slate-800">学生情報を編集</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            学生ID
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            氏名
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            新しいパスワード(変更する場合のみ入力)
            <input
              type="password"
              className="rounded-md border border-slate-300 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="未入力の場合は変更しません"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            クラス名(任意)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            読み方(任意)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            国籍(任意)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            性別(任意)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 notranslate"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
