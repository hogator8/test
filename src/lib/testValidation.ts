const LEAVE_ACTIONS = new Set(["warning_only", "auto_pause", "auto_submit"]);

/** Validates the leave-detection settings shared by both test create and edit. Returns an error string, or null if valid. */
export function validateLeaveSettings(opts: {
  leaveDetectionEnabled: boolean;
  leaveAction: string;
  leaveStagedMode: boolean;
  leaveStagedActions: string[];
  pauseReleasePin: string;
}): string | null {
  if (!LEAVE_ACTIONS.has(opts.leaveAction)) {
    return "離脱時の挙動が不正です";
  }
  if (opts.leaveDetectionEnabled && opts.leaveStagedMode) {
    if (opts.leaveStagedActions.length === 0) {
      return "段階的な設定では、最低1段階が必要です";
    }
    for (const a of opts.leaveStagedActions) {
      if (!LEAVE_ACTIONS.has(a)) return "段階ごとの挙動が不正です";
    }
  }
  const needsPin = opts.leaveDetectionEnabled
    ? opts.leaveStagedMode
      ? opts.leaveStagedActions.includes("auto_pause")
      : opts.leaveAction === "auto_pause"
    : false;
  if (needsPin && !/^\d{4}$/.test(opts.pauseReleasePin)) {
    return "自動一時停止を使用する場合、解除用の4桁PIN(数字)を設定してください";
  }
  return null;
}
