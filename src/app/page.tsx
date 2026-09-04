import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-center text-2xl font-bold text-slate-800">
        オンラインテストシステム
      </h1>
      <div className="flex w-full flex-col gap-4">
        <Link
          href="/student/login"
          className="rounded-lg bg-blue-600 px-6 py-4 text-center text-lg font-semibold text-white shadow hover:bg-blue-700"
        >
          学生ログイン
        </Link>
        <Link
          href="/teacher/login"
          className="rounded-lg border border-slate-300 bg-white px-6 py-4 text-center text-lg font-semibold text-slate-700 shadow hover:bg-slate-50"
        >
          教員ログイン
        </Link>
      </div>
    </main>
  );
}
