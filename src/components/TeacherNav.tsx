"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function TeacherNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/teacher/login") return null;

  async function handleLogout() {
    await fetch("/api/teacher/logout", { method: "POST" });
    router.push("/teacher/login");
    router.refresh();
  }

  const linkClass = (href: string) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      pathname.startsWith(href)
        ? "bg-blue-600 text-white"
        : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="mr-4 font-bold text-slate-800">教員管理画面</span>
          <Link href="/teacher/tests" className={linkClass("/teacher/tests")}>
            テスト一覧
          </Link>
          <Link href="/teacher/students" className={linkClass("/teacher/students")}>
            学生管理
          </Link>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          ログアウト
        </button>
      </div>
    </nav>
  );
}
