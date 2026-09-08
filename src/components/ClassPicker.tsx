"use client";

export function ClassPicker({
  availableClasses,
  selectedClasses,
  onChange,
}: {
  availableClasses: string[];
  selectedClasses: string[];
  onChange: (classes: string[]) => void;
}) {
  function toggle(className: string) {
    if (selectedClasses.includes(className)) {
      onChange(selectedClasses.filter((c) => c !== className));
    } else {
      onChange([...selectedClasses, className]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {availableClasses.length === 0 ? (
        <p className="text-sm text-slate-500">登録済みの学生にクラス名が設定されていません。</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md bg-slate-50 p-3">
          {availableClasses.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={selectedClasses.includes(c)} onChange={() => toggle(c)} />
              <span className="notranslate">{c}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">未選択の場合は全学生が対象になります。</p>
    </div>
  );
}
