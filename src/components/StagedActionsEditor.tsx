"use client";

const ACTION_LABELS: Record<string, string> = {
  warning_only: "警告のみ",
  auto_pause: "自動一時停止",
  auto_submit: "自動提出",
};

export function StagedActionsEditor({
  stagedActions,
  onChange,
}: {
  stagedActions: string[];
  onChange: (actions: string[]) => void;
}) {
  function updateStage(index: number, value: string) {
    const next = [...stagedActions];
    next[index] = value;
    onChange(next);
  }

  function addStage() {
    onChange([...stagedActions, "auto_submit"]);
  }

  function removeStage(index: number) {
    if (stagedActions.length <= 1) return;
    onChange(stagedActions.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
      {stagedActions.map((action, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-40 text-sm text-slate-600">
            段階{i + 1}({i + 1}回目{i === stagedActions.length - 1 ? "以降" : ""}の離脱)
          </span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={action}
            onChange={(e) => updateStage(i, e.target.value)}
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {stagedActions.length > 1 && (
            <button
              type="button"
              onClick={() => removeStage(i)}
              className="text-sm text-red-600 hover:underline"
            >
              削除
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addStage}
        className="mt-1 w-fit rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
      >
        + 段階を追加
      </button>
    </div>
  );
}
