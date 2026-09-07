export type LeaveAction = "warning_only" | "auto_pause" | "auto_submit";

export const LEAVE_ACTIONS: ReadonlySet<string> = new Set<LeaveAction>([
  "warning_only",
  "auto_pause",
  "auto_submit",
]);

export interface LeaveStage {
  action: LeaveAction;
  count_threshold: number | null;
  duration_threshold_seconds: number | null;
}

/**
 * Accepts either the current object-array format or the legacy (pre-v7)
 * plain string-array format (e.g. ["warning_only","auto_pause"]) and always
 * returns the object-array shape. For the legacy format, a stage's
 * count_threshold is its 1-indexed position, reproducing the old "Nth leave
 * = stage N" behavior. Returns null for anything empty/invalid so callers
 * can treat it the same as "staged mode not in use".
 */
export function normalizeStagedActions(raw: unknown): LeaveStage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  if (typeof raw[0] === "string") {
    return (raw as string[])
      .filter((a): a is LeaveAction => LEAVE_ACTIONS.has(a))
      .map((action, i) => ({ action, count_threshold: i + 1, duration_threshold_seconds: null }));
  }

  const stages: LeaveStage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const action = obj.action;
    if (typeof action !== "string" || !LEAVE_ACTIONS.has(action)) continue;
    const countThreshold = typeof obj.count_threshold === "number" ? obj.count_threshold : null;
    const durationThreshold =
      typeof obj.duration_threshold_seconds === "number" ? obj.duration_threshold_seconds : null;
    stages.push({
      action: action as LeaveAction,
      count_threshold: countThreshold,
      duration_threshold_seconds: durationThreshold,
    });
  }
  return stages.length > 0 ? stages : null;
}

/** A stage is satisfied once the session's cumulative count or duration reaches whichever threshold(s) it defines. */
export function isStageThresholdMet(
  stage: LeaveStage,
  cumulativeCount: number,
  cumulativeDurationSeconds: number
): boolean {
  if (stage.count_threshold !== null && cumulativeCount >= stage.count_threshold) return true;
  if (stage.duration_threshold_seconds !== null && cumulativeDurationSeconds >= stage.duration_threshold_seconds) {
    return true;
  }
  return false;
}
