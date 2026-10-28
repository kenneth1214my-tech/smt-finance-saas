import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { rateLimitResumeAt } from "@/lib/xero-ratelimit";
import { syncArApBatchForSubsidiary, syncArApBatchForGroup } from "@/lib/xero-sync";

// A batch of up to AR_AP_BATCH_SIZE (40) contacts, potentially for more than one connection in
// the same request, needs real headroom — confirmed in production this route got killed mid-batch
// without it (still made real progress on 23 contacts before the cutoff, since each contact is
// committed individually, but every tick deserves a full attempt rather than an arbitrary partial
// one). Duration limits aren't part of Hobby's cron-frequency restriction (see below), so this is
// safe to set the same as the other Xero sync routes.
export const maxDuration = 120;

// Vercel's Hobby plan caps cron jobs at once per day, too slow to progress the AR/AP resumable
// cursor (see xero-sync.ts's runArApBatch) at any meaningful pace — so instead of a dedicated
// cron, the Settings page fires this once per page view (see the useEffect in SettingsClient.tsx)
// to advance one batch per connection. Throttled to at most once every 3 minutes per connection
// (checked cheaply via arApLastBatchAt, no Xero calls) so someone re-opening or refreshing
// Settings repeatedly doesn't multiply real API usage.
const MIN_INTERVAL_MS = 3 * 60 * 1000;
// A cycle now refreshes every contact in a handful of calls, so once one has completed the next is not needed for hours. Without this
// gap the Settings-page trigger re-ran the whole cycle every 3 minutes, all day, against Xero's 5,000-calls-a-day quota.
const MIN_CYCLE_GAP_MS = 6 * 60 * 60 * 1000;

function dueForTick(lastBatchAt: Date | null, lastError: string | null = null, cycleInProgress = true): boolean {
  // While Xero's daily quota is exhausted every call fails, so don't even try until it resets.
  const resumeAt = rateLimitResumeAt(lastError, lastBatchAt);
  if (resumeAt && resumeAt.getTime() > Date.now()) return false;
  if (!lastBatchAt) return true;
  const gap = cycleInProgress ? MIN_INTERVAL_MS : MIN_CYCLE_GAP_MS;
  return Date.now() - lastBatchAt.getTime() >= gap;
}

export async function POST() {
  const user = await requireAdmin();
  const organizationId = user.organizationId;

  const [connections, groupConnection] = await Promise.all([
    db.xeroConnection.findMany({ where: { organizationId, connectedAt: { not: null } } }),
    db.xeroGroupConnection.findUnique({ where: { organizationId } }),
  ]);

  const results: { scope: string; ok: boolean; processed: number; pendingBefore: number; cycleComplete: boolean; skipped?: boolean }[] = [];

  for (const conn of connections) {
    if (!dueForTick(conn.arApLastBatchAt, conn.arApLastBatchError, conn.arApCycleStartedAt !== null)) {
      results.push({ scope: conn.subsidiaryId, ok: true, processed: 0, pendingBefore: 0, cycleComplete: false, skipped: true });
      continue;
    }
    let result: { ok: boolean; processed: number; pendingBefore: number; cycleComplete: boolean; errors: string[] };
    try {
      result = await syncArApBatchForSubsidiary(conn.subsidiaryId, organizationId);
    } catch (err) {
      result = { ok: false, processed: 0, pendingBefore: 0, cycleComplete: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
    await db.xeroConnection.update({ where: { id: conn.id }, data: { arApLastBatchAt: new Date(), arApLastBatchError: result.errors.length ? result.errors.join("; ") : null } });
    results.push({ scope: conn.subsidiaryId, ...result });
  }

  if (groupConnection?.connectedAt && dueForTick(groupConnection.arApLastBatchAt, groupConnection.arApLastBatchError, groupConnection.arApCycleStartedAt !== null)) {
    let result: { ok: boolean; processed: number; pendingBefore: number; cycleComplete: boolean; errors: string[] };
    try {
      result = await syncArApBatchForGroup(organizationId);
    } catch (err) {
      result = { ok: false, processed: 0, pendingBefore: 0, cycleComplete: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
    await db.xeroGroupConnection.update({ where: { id: groupConnection.id }, data: { arApLastBatchAt: new Date(), arApLastBatchError: result.errors.length ? result.errors.join("; ") : null } });
    results.push({ scope: "group", ...result });
  } else if (groupConnection?.connectedAt) {
    results.push({ scope: "group", ok: true, processed: 0, pendingBefore: 0, cycleComplete: false, skipped: true });
  }

  return NextResponse.json({ ok: true, results });
}
