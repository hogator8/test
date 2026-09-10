"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface OtherTeacher {
  userId: string;
  name: string;
  email: string;
}

interface AdminOrgInfo {
  organizationId: string;
  orgLabel: string;
  otherTeachers: OtherTeacher[];
  studentCount: number;
  testCount: number;
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

  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [adminOrgs, setAdminOrgs] = useState<AdminOrgInfo[] | null>(null);
  const [deleteCheckErr, setDeleteCheckErr] = useState<string | null>(null);
  const [transferSelections, setTransferSelections] = useState<Record<string, string>>({});
  const [transferringOrgId, setTransferringOrgId] = useState<string | null>(null);
  const [transferErr, setTransferErr] = useState<string | null>(null);
  const [deleteConsent, setDeleteConsent] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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

  async function loadDeleteCheck() {
    setDeleteChecking(true);
    setDeleteCheckErr(null);
    try {
      const res = await fetch("/api/teacher/account/delete-check");
      const data = await res.json();
      if (!res.ok) {
        setDeleteCheckErr(data.error ?? "読み込みに失敗しました");
        return;
      }
      setAdminOrgs(data.adminOrgs ?? []);
    } catch {
      setDeleteCheckErr("通信エラーが発生しました");
    } finally {
      setDeleteChecking(false);
    }
  }

  function handleOpenDelete() {
    setDeleteOpen(true);
    setDeleteConsent(false);
    setDeletePassword("");
    setDeleteErr(null);
    loadDeleteCheck();
  }

  async function handleTransfer(organizationId: string) {
    const newAdminUserId = transferSelections[organizationId];
    if (!newAdminUserId) return;
    setTransferErr(null);
    setTransferringOrgId(organizationId);
    try {
      const res = await fetch("/api/teacher/account/transfer-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, newAdminUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransferErr(data.error ?? "移譲に失敗しました");
        return;
      }
      await loadDeleteCheck();
    } catch {
      setTransferErr("通信エラーが発生しました");
    } finally {
      setTransferringOrgId(null);
    }
  }

  async function handleDeleteAccount() {
    setDeleteErr(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/teacher/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteErr(data.error ?? "削除に失敗しました");
        return;
      }
      try {
        await getSupabaseBrowser().auth.signOut();
      } catch {
        // Our own cookie is already cleared server-side; a client-side
        // sign-out failure shouldn't block returning to the login screen.
      }
      router.push("/teacher/login");
      router.refresh();
    } catch {
      setDeleteErr("通信エラーが発生しました");
    } finally {
      setDeleting(false);
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

      <section className="mt-8 rounded-lg border border-red-200 bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-red-700">アカウントを削除</h2>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={handleOpenDelete}
            className="rounded-md border border-red-300 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
          >
            アカウントを削除する
          </button>
        ) : (
          <DeleteAccountFlow
            checking={deleteChecking}
            checkErr={deleteCheckErr}
            adminOrgs={adminOrgs}
            transferSelections={transferSelections}
            setTransferSelections={setTransferSelections}
            transferringOrgId={transferringOrgId}
            transferErr={transferErr}
            onTransfer={handleTransfer}
            deleteConsent={deleteConsent}
            setDeleteConsent={setDeleteConsent}
            deletePassword={deletePassword}
            setDeletePassword={setDeletePassword}
            deleting={deleting}
            deleteErr={deleteErr}
            onDelete={handleDeleteAccount}
            onCancel={() => setDeleteOpen(false)}
          />
        )}
      </section>
    </main>
  );
}

function DeleteAccountFlow({
  checking,
  checkErr,
  adminOrgs,
  transferSelections,
  setTransferSelections,
  transferringOrgId,
  transferErr,
  onTransfer,
  deleteConsent,
  setDeleteConsent,
  deletePassword,
  setDeletePassword,
  deleting,
  deleteErr,
  onDelete,
  onCancel,
}: {
  checking: boolean;
  checkErr: string | null;
  adminOrgs: AdminOrgInfo[] | null;
  transferSelections: Record<string, string>;
  setTransferSelections: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  transferringOrgId: string | null;
  transferErr: string | null;
  onTransfer: (organizationId: string) => void;
  deleteConsent: boolean;
  setDeleteConsent: (v: boolean) => void;
  deletePassword: string;
  setDeletePassword: (v: string) => void;
  deleting: boolean;
  deleteErr: string | null;
  onDelete: () => void;
  onCancel: () => void;
}) {
  if (checking) {
    return <p className="text-slate-500">確認中...</p>;
  }
  if (checkErr) {
    return <p className="text-red-600">{checkErr}</p>;
  }
  if (!adminOrgs) return null;

  const pendingTransferOrgs = adminOrgs.filter((o) => o.otherTeachers.length > 0);
  const soloOrgs = adminOrgs.filter((o) => o.otherTeachers.length === 0);

  if (pendingTransferOrgs.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-slate-700">
          あなたが管理者のページには他のメンバーがいます。削除する前に、管理者を引き継ぐ人を選んでください。
        </p>
        {pendingTransferOrgs.map((org) => (
          <div key={org.organizationId} className="rounded-md border border-slate-200 p-4">
            <p className="mb-2 font-medium text-slate-800">{org.orgLabel}</p>
            <div className="flex items-center gap-3">
              <select
                className="rounded-md border border-slate-300 px-3 py-2"
                value={transferSelections[org.organizationId] ?? ""}
                onChange={(e) =>
                  setTransferSelections((prev) => ({ ...prev, [org.organizationId]: e.target.value }))
                }
              >
                <option value="">教員を選択</option>
                {org.otherTeachers.map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {t.name}({t.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!transferSelections[org.organizationId] || transferringOrgId === org.organizationId}
                onClick={() => onTransfer(org.organizationId)}
                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {transferringOrgId === org.organizationId ? "移譲中..." : "管理者を移譲する"}
              </button>
            </div>
          </div>
        ))}
        {transferErr && <p className="text-sm text-red-600">{transferErr}</p>}
        <button type="button" onClick={onCancel} className="self-start text-sm text-slate-500 hover:underline">
          キャンセル
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {soloOrgs.length > 0 && (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          {soloOrgs.map((org) => (
            <p key={org.organizationId} className="mb-1">
              このページ({org.orgLabel})には学生{org.studentCount}名、テスト{org.testCount}件のデータがあります。
              削除すると、このデータには誰もアクセスできなくなります(データベースから完全に消去されるわけではありませんが、事実上復元できません)。
            </p>
          ))}
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={deleteConsent}
              onChange={(e) => setDeleteConsent(e.target.checked)}
            />
            上記の内容を理解し、削除に同意します
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        パスワード(確認のため再入力)
        <input
          type="password"
          className="rounded-md border border-slate-300 px-3 py-2"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
        />
      </label>
      {deleteErr && <p className="text-sm text-red-600">{deleteErr}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={deleting || !deletePassword || (soloOrgs.length > 0 && !deleteConsent)}
          onClick={onDelete}
          className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "削除中..." : "本当にアカウントを削除する"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:underline">
          キャンセル
        </button>
      </div>
    </div>
  );
}
