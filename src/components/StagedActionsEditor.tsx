"use client";

import type { LeaveAction, LeaveStage } from "@/lib/leaveStages";

const ACTION_LABELS: Record<LeaveAction, string> = {
  warning_only: "警告のみ",
  auto_pause: "自動一時停止",
  auto_submit: "自動提出",
};

export function StagedActionsEditor({
  stagedActions,
  onChange,
}: {
  stagedActions: LeaveStage[];
  onChange: (stages: LeaveStage[]) => void;
}) {
  function updateStage(index: number, patch: Partial<LeaveStage>) {
    const next = stagedActions.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  function addStage() {
    onChange([...stagedActions, { action: "auto_submit", count_threshold: null, duration_threshold_seconds: null }]);
  }

  function removeStage(index: number) {
    if (stagedActions.length <= 1) return;
    onChange(stagedActions.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-slate-50 p-3">
      {stagedActions.map((stage, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
          <span className="w-16 text-sm font-semibold text-slate-600">段階{i + 1}</span>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            挙動
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={stage.action}
              onChange={(e) => updateStage(i, { action: e.target.value as LeaveAction })}
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            累計離脱回数のしきい値
            <input
              type="number"
              min={1}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={stage.count_threshold ?? ""}
              onChange={(e) =>
                updateStage(i, { count_threshold: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder="空欄可"
            />
            回
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            累計離脱時間のしきい値
            <input
              type="number"
              min={1}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={stage.duration_threshold_seconds ?? ""}
              onChange={(e) =>
                updateStage(i, {
                  duration_threshold_seconds: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="空欄可"
            />
            秒
          </label>
          {stagedActions.length > 1 && (
            <button type="button" onClick={() => removeStage(i)} className="text-sm text-red-600 hover:underline">
              削除
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-slate-500">
        各段階は、離脱の累計回数・累計時間のいずれかがしきい値に達した時点で発動します(回数・時間の少なくとも一方を入力してください)。
        判定はセッション全体の累計値で行われ、既に発動済みの段階は再度発動しません。
      </p>
      <button
        type="button"
        onClick={addStage}
        className="w-fit rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        + 段階を追加
      </button>
    </div>
  );
}
