"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

interface Member {
  userId: string;
  role: "admin" | "teacher";
  name: string;
  email: string;
}

interface Me {
  name: string | null;
  email: string | null;
  organizationId: string;
  orgRole: "admin" | "teacher";
  orgAdminName: string;
}

export default function TeacherOrgPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [adminName, setAdminName] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selfName, setSelfName] = useState("");
  const [selfEmail, setSelfEmail] = useState("");
  const [selfPassword, setSelfPassword] = useState("");
  const [selfSaving, setSelfSaving] = useState(false);
  const [selfMsg, setSelfMsg] = useState<string | null>(null);
  const [selfErr, setSelfErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const meRes = await fetch("/api/teacher/me");
      const meData = await meRes.json();
      if (!meRes.ok) {
        setErrorMsg(meData.error ?? "読み込みに失敗しました");
        return;
      }
      setMe(meData);
      setSelfName(meData.name ?? "");
      setSelfEmail(meData.email ?? "");

      if (meData.orgRole !== "admin") {
        setForbidden(true);
        return;
      }

      const orgRes = await fetch("/api/teacher/org");
      const orgData = await orgRes.json();
      if (!orgRes.ok) {
        if (orgRes.status === 403) {
          setForbidden(true);
          return;
        }
        setErrorMsg(orgData.error ?? "読み込みに失敗しました");
        return;
      }
      setAdminName(orgData.adminName ?? "");
      setMembers(orgData.members ?? []);
    } catch {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSelfSave(e: React.FormEvent) {
    e.preventDefault();
    setSelfErr(null);
    setSelfMsg(null);
    setSelfSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      const updates: { email?: string; password?: string; data?: { name: string } } = {};
      if (selfEmail && selfEmail !== me?.email) updates.email = selfEmail;
      if (selfPassword) updates.password = selfPassword;
      if (selfName && selfName !== me?.name) updates.data = { name: selfName };

      if (Object.keys(updates).length === 0) {
        setSelfMsg("変更はありません");
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        setSelfErr("更新に失敗しました");
        return;
      }
      setSelfPassword("");
      setSelfMsg("更新しました");
      await load();
    } catch {
      setSelfErr("通信エラーが発生しました");
    } finally {
      setSelfSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr(null);
    setInviteMsg(null);
    setInviting(true);
    try {
      const res = await fetch("/api/teacher/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteErr(data.error ?? "招待に失敗しました");
        return;
      }
      setInviteMsg(`${inviteEmail} を招待しました`);
      setInviteEmail("");
    } catch {
      setInviteErr("通信エラーが発生しました");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("このメンバーを削除しますか？")) return;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/teacher/org/members/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-3xl px-4 py-8 text-slate-500">読み込み中...</main>;
  }

  if (forbidden) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-slate-700">この画面は管理者のみ閲覧できます。</p>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-red-600">{errorMsg}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-slate-800">教員管理画面({adminName}先生のページ)</h1>

      <section className="mb-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-slate-800">自分のアカウント情報</h2>
        <form onSubmit={handleSelfSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            氏名
            <input
              type="text"
              className="rounded-md border border-slate-300 px-3 py-2"
              value={selfName}
              onChange={(e) => setSelfName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            メールアドレス
            <input
              type="email"
              className="rounded-md border border-slate-300 px-3 py-2"
              value={selfEmail}
              onChange={(e) => setSelfEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            新しいパスワード(変更する場合のみ)
            <input
              type="password"
              className="rounded-md border border-slate-300 px-3 py-2"
              value={selfPassword}
              onChange={(e) => setSelfPassword(e.target.value)}
              minLength={6}
              placeholder="変更しない場合は空欄"
            />
          </label>
          {selfErr && <p className="text-sm text-red-600">{selfErr}</p>}
          {selfMsg && <p className="text-sm text-green-600">{selfMsg}</p>}
          <button
            type="submit"
            disabled={selfSaving}
            className="self-start rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {selfSaving ? "更新中..." : "更新する"}
          </button>
        </form>
      </section>

      <section className="mb-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-slate-800">教員を招待</h2>
        <form onSubmit={handleInvite} className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
            メールアドレス
            <input
              type="email"
              className="rounded-md border border-slate-300 px-3 py-2"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {inviting ? "送信中..." : "招待する"}
          </button>
        </form>
        {inviteErr && <p className="mt-2 text-sm text-red-600">{inviteErr}</p>}
        {inviteMsg && <p className="mt-2 text-sm text-green-600">{inviteMsg}</p>}
      </section>

      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-slate-800">メンバー一覧</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">氏名</th>
              <th className="py-2">メールアドレス</th>
              <th className="py-2">権限</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-slate-100">
                <td className="py-2">{m.name}</td>
                <td className="py-2">{m.email}</td>
                <td className="py-2">{m.role === "admin" ? "管理者" : "教員"}</td>
                <td className="py-2 text-right">
                  {m.role === "teacher" && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.userId)}
                      disabled={removingId === m.userId}
                      className="rounded-md px-3 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
