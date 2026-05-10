/**
 * Risk Assessment types and passing results into the research chat (session storage + LLM context block).
 */
export type RiskLevel = "low" | "moderate" | "high";

export type FindriscBreakdownItem = { id: string; label: string; points: number };
export type DiabetesBreakdownItem = { id: string; label: string; points: number };

/**
 * Transparent engine output: FINDRISC + optional ASCVD PCE (White), ACC/AHA BP staging.
 * See docs/RISK_METHODOLOGY.md.
 */
export interface RiskResult {
  bmi: number;
  bmiCategory: string;
  bmiRisk: RiskLevel;
  waistToHeightRatio: number;
  waistToHeightCategory: string;
  fastingGlucoseMgdl: number;
  hba1cPercent: number | null;
  triglyceridesMgdl: number | null;
  hdlCholesterolMgdl: number | null;
  lpaMgdl: number | null;
  idrsBaseScore: number;
  idrsBreakdown: DiabetesBreakdownItem[];
  idrsBaseRiskLevel: RiskLevel;
  idrsEducationalPercent: number;
  diabetesModifierBurdenCount: number;
  diabetesModifierBurdenLevel: RiskLevel;
  diabetesModifierItems: string[];
  diabetesOverallConcern: RiskLevel;
  findriscScore: number | null;
  findriscBreakdown: FindriscBreakdownItem[] | null;
  findriscTenYearDiabetesPercent: number | null;
  ascvdTenYearPercent: number | null;
  ascvdUnavailableReason: string | null;
  ascvdRiskLevel: RiskLevel | null;
  ascvdEnhancerFactors: string[];
  ascvdEnhancerBurdenCount: number;
  ascvdEnhancerBurdenLabel: "low" | "moderate" | "high";
  ascvdEnhancerInterpretation: string;
  exploratoryAdjustedRange: string | null;
  bpCategoryLabel: string;
  bpCategorySeverity: RiskLevel;
  overallConcernLevel: RiskLevel;
  recommendations: string[];
}

export const RISK_SCREENER_STORAGE_KEY = "sah_risk_screener_for_chat_v2";

export interface StoredRiskPayload {
  version: 2;
  at: string;
  result: RiskResult;
}

/** Plain-language block sent to the chat API for personalization. */
export function formatRiskScreenerContextForChat(r: RiskResult): string {
  const lines: string[] = [
    "South Asian health Risk Assessment (in-app, educational; not a diagnosis):",
    `- Overall cardiometabolic concern: ${r.overallConcernLevel}`,
    `- BMI: ${r.bmi} kg/m² — ${r.bmiCategory}`,
    `- Waist-to-height ratio: ${r.waistToHeightRatio} (${r.waistToHeightCategory})`,
    `- IDRS+ South Asian diabetes profile: base score ${r.idrsBaseScore}/100 (${r.idrsBaseRiskLevel}), educational ~8-year estimate ${r.idrsEducationalPercent}% with modifier burden ${r.diabetesModifierBurdenCount} (${r.diabetesModifierBurdenLevel})`,
    r.ascvdTenYearPercent !== null
      ? `- 10-year ASCVD risk (2013 ACC/AHA PCE, NH White coefficients): ${r.ascvdTenYearPercent}% (${r.ascvdRiskLevel ?? "n/a"})`
      : `- 10-year ASCVD: ${r.ascvdUnavailableReason ?? "not calculated"}`,
    `- South Asian ASCVD enhancer burden: ${r.ascvdEnhancerBurdenLabel} (${r.ascvdEnhancerBurdenCount} additional factors)`,
    `- Blood pressure category (2017 ACC/AHA): ${r.bpCategoryLabel} (${r.bpCategorySeverity})`,
  ];
  const recs = r.recommendations.filter(
    (s) => !/educational estimates|not a diagnos/i.test(s)
  );
  if (recs.length > 0) {
    lines.push("Assessment highlights to consider when answering:");
    recs.forEach((s) => {
      if (s.length < 500) lines.push(`• ${s}`);
    });
  }
  return lines.join("\n");
}

export function storeRiskScreenerForChat(result: RiskResult): void {
  if (typeof window === "undefined") return;
  const payload: StoredRiskPayload = { version: 2, at: new Date().toISOString(), result };
  try {
    sessionStorage.setItem(RISK_SCREENER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function readRiskScreenerFromSession(): { context: string; at: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RISK_SCREENER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredRiskPayload | { version?: number };
    if (data?.version !== 2 || !(data as StoredRiskPayload)?.result) return null;
    const pl = data as StoredRiskPayload;
    return { context: formatRiskScreenerContextForChat(pl.result), at: pl.at };
  } catch {
    return null;
  }
}

export function clearRiskScreenerFromSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RISK_SCREENER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
