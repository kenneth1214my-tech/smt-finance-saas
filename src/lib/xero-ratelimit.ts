// Xero enforces a daily API quota; once it is exhausted every call gets a 429 whose Retry-After can
// be many hours (see xero.ts xeroGet, which fails fast instead of sleeping that long). Pure helpers —
// no I/O — shared by the AR/AP batch (to stop at the first 429 instead of failing every contact), the
// batch tick route (to skip calling Xero until the quota resets) and the Settings page (to show one
// clear "paused until" line instead of a wall of per-contact errors).

const WAIT_RE = /429 rate limited[^0-9]*?asked to wait (\d+)s/g;

/** Seconds Xero asked us to wait, if this error text is a rate-limit error (the smallest value when
 *  several are concatenated, since later calls report the least remaining time). */
export function rateLimitWaitSec(text: string | null | undefined): number | null {
  if (!text) return null;
  const waits = [...text.matchAll(WAIT_RE)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  return waits.length ? Math.min(...waits) : null;
}

/** When a stored batch error says Xero is rate-limiting us, the time it is worth trying again. */
export function rateLimitResumeAt(storedError: string | null | undefined, recordedAt: Date | string | null | undefined): Date | null {
  const sec = rateLimitWaitSec(storedError);
  if (sec === null || !recordedAt) return null;
  return new Date(new Date(recordedAt).getTime() + sec * 1000);
}

/** The last-sync error as a person should see it: "too many contacts for a live pass" is an expected
 *  skip (the background batch covers it), not a failure, so it is dropped; null when nothing real is left. */
export function visibleSyncError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // The skip message itself contains a "; " ("…within one sync; use the "Smart AR Aging import"…"), so it is
  // removed as one piece before the remaining errors are split apart.
  const rest = raw.replace(/AR\/AP:\s*skipped\s*—[\s\S]*?upload instead/g, "");
  const kept = rest.split(";").map((p) => p.trim()).filter(Boolean);
  return kept.length ? kept.join("; ") : null;
}

/** One short line for the AR/AP background batch's stored error. A quota pause is a normal, self-healing
 *  state (not a failure); anything else is cut down to the first problem plus a count. */
export function describeBatchError(
  raw: string | null | undefined,
  recordedAt: Date | string | null | undefined,
  isZh: boolean,
  now: Date = new Date()
): { text: string; rateLimited: boolean } | null {
  if (!raw) return null;
  const resumeAt = rateLimitResumeAt(raw, recordedAt);
  if (resumeAt) {
    if (resumeAt.getTime() <= now.getTime()) {
      return { text: isZh ? "Xero 每日接口额度已重置，将在下一批次自动继续" : "Xero's daily API quota has reset — resuming on the next batch", rateLimited: true };
    }
    const when = resumeAt.toLocaleString(isZh ? "zh-CN" : "en-SG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return {
      text: isZh ? `已暂停——Xero 每日接口额度已用完，预计 ${when} 后自动继续，无需人工操作` : `paused — Xero's daily API quota is used up; resumes automatically after ${when}, no action needed`,
      rateLimited: true,
    };
  }
  const parts = raw.split("; ").filter(Boolean);
  const first = parts[0].length > 140 ? `${parts[0].slice(0, 140)}…` : parts[0];
  const more = parts.length > 1 ? (isZh ? `（另有 ${parts.length - 1} 项）` : ` (+${parts.length - 1} more)`) : "";
  return { text: `${first}${more}`, rateLimited: false };
}
