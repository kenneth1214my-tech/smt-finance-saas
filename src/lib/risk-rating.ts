export type RiskSeverity = "GOOD" | "WARNING" | "SERIOUS" | "CRITICAL";

const SEVERITY_ORDER: RiskSeverity[] = ["GOOD", "WARNING", "SERIOUS", "CRITICAL"];

export function worse(a: RiskSeverity, b: RiskSeverity): RiskSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

// A subsidiary's riskRating is a manually-set field that defaults to GOOD and often never
// gets touched — left alone, a real revenue collapse shows as "Healthy" forever. This escalates
// the displayed rating using computed YoY growth AND the current period's net margin, taking
// whichever of the three is worse, so a stale manual "GOOD" can't hide an actual decline. Net
// margin matters independently of YoY because a newly-onboarded entity with no prior-year
// baseline (yoyGrowthPct passed as 0) can still be genuinely loss-making right now — that must
// not read as "Healthy" just because there's nothing to compare it against yet. Only ever
// escalates, never downgrades an admin's own worse-than-computed judgment call.
export function effectiveRiskRating(manual: RiskSeverity, yoyGrowthPct: number, netMarginPct = 0): RiskSeverity {
  let fromYoy: RiskSeverity = "GOOD";
  if (yoyGrowthPct <= -30) fromYoy = "CRITICAL";
  else if (yoyGrowthPct <= -15) fromYoy = "SERIOUS";
  else if (yoyGrowthPct < 0) fromYoy = "WARNING";

  let fromMargin: RiskSeverity = "GOOD";
  if (netMarginPct <= -20) fromMargin = "CRITICAL";
  else if (netMarginPct <= -10) fromMargin = "SERIOUS";
  else if (netMarginPct < 0) fromMargin = "WARNING";

  return worse(worse(manual, fromYoy), fromMargin);
}

// Same escalate-only philosophy as effectiveRiskRating, but for the value actually STORED on
// Subsidiary.riskRating after a Xero sync — the admin table showed a real subsidiary's rating
// stuck at "GOOD" forever because riskRating was pure manual entry, even after the sync started
// pulling in a real debt ratio and real AR aging. Called from xero-sync.ts once Balance Sheet
// and AR data are in, so the stored rating actually reflects synced numbers instead of only
// whatever an admin once typed.
export function computeSyncedRiskRating(current: RiskSeverity, debtRatio: number, worstArStatus: RiskSeverity): RiskSeverity {
  let fromDebtRatio: RiskSeverity = "GOOD";
  if (debtRatio >= 70) fromDebtRatio = "CRITICAL";
  else if (debtRatio >= 55) fromDebtRatio = "SERIOUS";
  else if (debtRatio >= 40) fromDebtRatio = "WARNING";
  return worse(worse(current, fromDebtRatio), worstArStatus);
}
