import { LEAVE_ACTIONS, LeaveStage } from "@/lib/leaveStages";

/** Validates the leave-detection settings shared by both test create and edit. Returns an error string, or null if valid. */
export function validateLeaveSettings(opts: {
  leaveDetectionEnabled: boolean;
  leaveAction: string;
  leaveStagedMode: boolean;
  leaveStagedActions: LeaveStage[];
  pauseReleasePin: string;
}): string | null {
  if (!LEAVE_ACTIONS.has(opts.leaveAction)) {
    return "離脱時の挙動が不正です";
  }
  if (opts.leaveDetectionEnabled && opts.leaveStagedMode) {
    if (opts.leaveStagedActions.length === 0) {
      return "段階的な設定では、最低1段階が必要です";
    }
    for (const stage of opts.leaveStagedActions) {
      if (!stage || !LEAVE_ACTIONS.has(stage.action)) return "段階ごとの挙動が不正です";
      const count = stage.count_threshold;
      const duration = stage.duration_threshold_seconds;
      if (count === null && duration === null) {
        return "各段階には、累計離脱回数・累計離脱時間のしきい値を少なくとも一方入力してください";
      }
      if (count !== null && (!Number.isInteger(count) || count <= 0)) {
        return "累計離脱回数のしきい値は正の整数で入力してください";
      }
      if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) {
        return "累計離脱時間のしきい値は正の整数で入力してください";
      }
    }
  }
  const needsPin = opts.leaveDetectionEnabled
    ? opts.leaveStagedMode
      ? opts.leaveStagedActions.some((s) => s.action === "auto_pause")
      : opts.leaveAction === "auto_pause"
    : false;
  if (needsPin && !/^\d{4}$/.test(opts.pauseReleasePin)) {
    return "自動一時停止を使用する場合、解除用の4桁PIN(数字)を設定してください";
  }
  return null;
}
