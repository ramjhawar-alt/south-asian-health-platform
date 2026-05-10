/**
 * South Asian-focused risk calculations for the Risk Assessment flow.
 * Uses standard models (ASCVD PCE, ACC/AHA BP) with transparent South Asian interpretation layers.
 */

import { EXPLORATORY_ASCVD_MULTIPLIERS, RISK_THRESHOLDS } from "@/lib/risk-constants";
import type {
  DiabetesBreakdownItem,
  FindriscBreakdownItem,
  RiskLevel,
  RiskResult,
} from "@/lib/risk-screener";

// ---------------------------------------------------------------------------
// ACC/AHA pooled cohort equations — White race (NH White proxy), ages 40–79
// Goff DC Jr et al., Circulation 2014 / 2013 ACC/AHA guideline appendix.
// ---------------------------------------------------------------------------

export interface AscvdInput {
  age: number;
  sex: "male" | "female";
  totalCholesterolMgdl: number;
  hdlCholesterolMgdl: number;
  systolicBp: number;
  /** Uses treated vs untreated SBP coefficient. */
  onBpTreatment: boolean;
  currentSmoker: boolean;
  hasDiabetes: boolean;
}

const BASELINE_SURVIVAL_WHITE_MALE = 0.9144;
const MEAN_LP_WHITE_MALE = 61.18;

const BASELINE_SURVIVAL_WHITE_FEMALE = 0.9665;
const MEAN_LP_WHITE_FEMALE = -29.18;

function ascvdMaleWhite(inp: AscvdInput): number {
  const a = inp.age;
  const lnAge = Math.log(a);
  const lnTc = Math.log(inp.totalCholesterolMgdl);
  const lnHdl = Math.log(inp.hdlCholesterolMgdl);
  const lnSbp = Math.log(inp.systolicBp);

  let lp =
    12.344 * lnAge +
    11.853 * lnTc +
    -2.664 * lnAge * lnTc +
    -7.99 * lnHdl +
    1.769 * lnAge * lnHdl +
    (inp.onBpTreatment ? 1.797 * lnSbp : 1.764 * lnSbp) +
    (inp.currentSmoker ? 7.837 * 1 + -1.795 * lnAge * 1 : 0) +
    (inp.hasDiabetes ? 0.658 * 1 : 0);

  const risk =
    (1 - Math.pow(BASELINE_SURVIVAL_WHITE_MALE, Math.exp(lp - MEAN_LP_WHITE_MALE))) * 100;
  return Math.round(Math.min(99, Math.max(0, risk)) * 10) / 10;
}

function ascvdFemaleWhite(inp: AscvdInput): number {
  const a = inp.age;
  const lnAge = Math.log(a);
  const lnTc = Math.log(inp.totalCholesterolMgdl);
  const lnHdl = Math.log(inp.hdlCholesterolMgdl);
  const lnSbp = Math.log(inp.systolicBp);

  let lp =
    -29.799 * lnAge +
    4.884 * lnAge * lnAge +
    13.54 * lnTc +
    -3.114 * lnAge * lnTc +
    -13.578 * lnHdl +
    3.149 * lnAge * lnHdl +
    (inp.onBpTreatment ? 2.019 * lnSbp : 1.957 * lnSbp) +
    (inp.currentSmoker ? 7.574 * 1 + -1.665 * lnAge * 1 : 0) +
    (inp.hasDiabetes ? 0.661 * 1 : 0);

  const risk =
    (1 - Math.pow(BASELINE_SURVIVAL_WHITE_FEMALE, Math.exp(lp - MEAN_LP_WHITE_FEMALE))) * 100;
  return Math.round(Math.min(99, Math.max(0, risk)) * 10) / 10;
}

export function computeAscvdPceWhite(inp: AscvdInput): { percent: number } | { unavailableReason: string } {
  if (inp.age < 40 || inp.age > 79) {
    return { unavailableReason: "ACC/AHA Pooled Cohort Equations apply to ages 40–79." };
  }
  if (
    inp.totalCholesterolMgdl <= 0 ||
    inp.hdlCholesterolMgdl <= 0 ||
    inp.systolicBp <= 0
  ) {
    return { unavailableReason: "Total cholesterol, HDL-C, and systolic BP must be positive." };
  }

  const pct = inp.sex === "male" ? ascvdMaleWhite(inp) : ascvdFemaleWhite(inp);
  return { percent: pct };
}

export function ascvdRiskLevelFromPercent(pct: number): RiskLevel {
  if (pct < 5) return "low";
  if (pct < 15) return "moderate";
  return "high";
}

// ---------------------------------------------------------------------------
// ACC/AHA 2017 BP categories (office adults)
// ---------------------------------------------------------------------------

export type BpCategoryId =
  | "normal"
  | "elevated"
  | "stage1"
  | "stage2"
  | "crisis";

export interface BpStagingResult {
  categoryId: BpCategoryId;
  /** Human-readable label */
  label: string;
  /** Severity for UI chrome — crisis/stage2 often warrant urgent evaluation */
  level: RiskLevel;
}

/** ACC/AHA 2017 categories using office SBP and DBP (either qualifying suffices). */
export function accAhaBpCategory(sbp: number, dbp: number): BpStagingResult {
  if (sbp >= 180 || dbp >= 120) {
    return {
      categoryId: "crisis",
      label: "Hypertensive crisis",
      level: "high",
    };
  }
  if (sbp >= 140 || dbp >= 90) {
    return {
      categoryId: "stage2",
      label: "Stage 2 hypertension",
      level: "high",
    };
  }
  if (sbp >= 130 || dbp >= 80) {
    return {
      categoryId: "stage1",
      label: "Stage 1 hypertension",
      level: "moderate",
    };
  }
  if (sbp >= 120 && dbp < 80) {
    return {
      categoryId: "elevated",
      label: "Elevated blood pressure",
      level: "moderate",
    };
  }
  return {
    categoryId: "normal",
    label: "Normal blood pressure",
    level: "low",
  };
}

// ---------------------------------------------------------------------------
// Full assessment (Risk Assessment UI)
// ---------------------------------------------------------------------------

export interface AssessmentFormSnapshot {
  age: number;
  sex: "male" | "female";
  weightKg: number;
  heightCm: number;
  waistCm: number;
  dailyActivity30Min: boolean;
  vegetablesOrFruitDaily: boolean;
  takesBpMedication: boolean;
  priorHighGlucoseEver: boolean;
  fastingGlucoseMmol: number;
  hba1cPercent?: number | null;
  triglyceridesMgdl?: number | null;
  lpaMgdl?: number | null;
  familyDiabetes: boolean;
  familyPrematureAscvd: boolean;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hadGestationalDiabetes: boolean;
  isSmoker: boolean;
  systolicBP: number;
  diastolicBP: number;
  totalCholesterolMgdl: number;
  hdlCholesterolMgdl: number;
  physicalActivity: "sedentary" | "moderate" | "active";
  dietQuality: "poor" | "fair" | "good";
  sleepHours: number;
  drinksAlcohol: boolean;
}

export function calculateAsianBMIStatus(bmi: number): {
  category: string;
  level: RiskLevel;
} {
  if (bmi < RISK_THRESHOLDS.bmi.overweightLower) {
    return { category: "<23 normal", level: "low" };
  }
  if (bmi <= RISK_THRESHOLDS.bmi.overweightUpper) {
    return { category: "23–27.4 overweight / increased risk", level: "moderate" };
  }
  return { category: ">=27.5 obesity / high risk", level: "high" };
}

export function calculateWaistToHeightRatio(waistCm: number, heightCm: number): {
  ratio: number;
  category: string;
  level: RiskLevel;
} {
  const ratio = waistCm / Math.max(1, heightCm);
  if (ratio < RISK_THRESHOLDS.waistToHeightRatio.increasedRisk) {
    return { ratio, category: "<0.5 lower risk", level: "low" };
  }
  return { ratio, category: ">=0.5 increased central adiposity risk", level: "high" };
}

export function calculateIDRSBase(inp: AssessmentFormSnapshot): {
  score: number;
  category: RiskLevel;
  breakdown: DiabetesBreakdownItem[];
} {
  const breakdown: DiabetesBreakdownItem[] = [];
  const agePoints = inp.age < 35 ? 0 : inp.age < 50 ? 20 : 30;
  breakdown.push({ id: "age", label: "Age", points: agePoints });

  let waistPoints = 0;
  if (inp.sex === "male") {
    if (inp.waistCm >= 100) waistPoints = 20;
    else if (inp.waistCm >= 90) waistPoints = 10;
  } else {
    if (inp.waistCm >= 90) waistPoints = 20;
    else if (inp.waistCm >= 80) waistPoints = 10;
  }
  breakdown.push({ id: "waist", label: "Waist circumference", points: waistPoints });

  const activityPoints =
    inp.physicalActivity === "active" ? 0 : inp.physicalActivity === "moderate" ? 10 : 30;
  breakdown.push({ id: "activity", label: "Physical activity", points: activityPoints });

  const familyPoints = inp.familyDiabetes ? 10 : 0;
  breakdown.push({ id: "family", label: "Family history of diabetes", points: familyPoints });

  const score = breakdown.reduce((acc, row) => acc + row.points, 0);
  const category: RiskLevel =
    score <= RISK_THRESHOLDS.idrs.lowUpper
      ? "low"
      : score <= RISK_THRESHOLDS.idrs.moderateUpper
      ? "moderate"
      : "high";
  return { score, category, breakdown };
}

function mapIdrsToEducationalPercent(score: number): number {
  if (score <= RISK_THRESHOLDS.idrs.lowUpper) return 5.6;
  if (score <= RISK_THRESHOLDS.idrs.moderateUpper) return 16.9;
  return 27.8;
}

export function calculateDiabetesModifierBurden(inp: AssessmentFormSnapshot): {
  burdenCount: number;
  burdenLevel: RiskLevel;
  modifiers: string[];
} {
  const bmi = inp.weightKg / Math.pow(inp.heightCm / 100, 2);
  const whtr = inp.waistCm / Math.max(1, inp.heightCm);
  const fastingMgdl = inp.fastingGlucoseMmol * 18;
  const modifiers: string[] = [];
  if (bmi >= RISK_THRESHOLDS.bmi.overweightLower) modifiers.push("BMI >=23");
  if (whtr >= RISK_THRESHOLDS.waistToHeightRatio.increasedRisk)
    modifiers.push("Waist-to-height ratio >=0.5");
  if ((inp.hba1cPercent ?? 0) >= RISK_THRESHOLDS.glucose.hba1cPrediabetes)
    modifiers.push("HbA1c >=5.7%");
  if (fastingMgdl >= RISK_THRESHOLDS.glucose.fastingPrediabetesMgdl)
    modifiers.push("Fasting glucose >=100 mg/dL");
  if (inp.hadGestationalDiabetes) modifiers.push("History of gestational diabetes");

  const burdenCount = modifiers.length;
  const burdenLevel: RiskLevel =
    burdenCount <= 1 ? "low" : burdenCount <= 3 ? "moderate" : "high";
  return { burdenCount, burdenLevel, modifiers };
}

export function calculateSouthAsianASCVDEnhancerBurden(inp: AssessmentFormSnapshot): {
  factors: string[];
  burdenCount: number;
  burdenLabel: "low" | "moderate" | "high";
} {
  const bmi = inp.weightKg / Math.pow(inp.heightCm / 100, 2);
  const whtr = inp.waistCm / Math.max(1, inp.heightCm);
  const fastingMgdl = inp.fastingGlucoseMmol * 18;
  const factors = ["South Asian ancestry (guideline-recognized risk enhancer)"];

  if (inp.familyPrematureAscvd) factors.push("Family history of premature ASCVD");
  if (bmi >= RISK_THRESHOLDS.bmi.overweightLower) factors.push("BMI >=23");
  if (whtr >= RISK_THRESHOLDS.waistToHeightRatio.increasedRisk)
    factors.push("Waist-to-height ratio >=0.5");
  if (inp.hasDiabetes || (inp.hba1cPercent ?? 0) >= RISK_THRESHOLDS.glucose.hba1cPrediabetes)
    factors.push("Prediabetes/diabetes signal");
  if (inp.systolicBP >= 120 || inp.diastolicBP >= 80 || inp.hasHypertension)
    factors.push("Elevated blood pressure / hypertension");
  if ((inp.triglyceridesMgdl ?? 0) >= RISK_THRESHOLDS.lipids.triglyceridesHighMgdl)
    factors.push("Triglycerides high");
  const hdlLow =
    inp.hdlCholesterolMgdl > 0 &&
    (inp.sex === "male"
      ? inp.hdlCholesterolMgdl < RISK_THRESHOLDS.lipids.hdlLowMaleMgdl
      : inp.hdlCholesterolMgdl < RISK_THRESHOLDS.lipids.hdlLowFemaleMgdl);
  if (hdlLow) factors.push("HDL low");
  if ((inp.lpaMgdl ?? 0) >= RISK_THRESHOLDS.lipids.lpaHighMgdl) factors.push("Lp(a) elevated");
  if (fastingMgdl >= RISK_THRESHOLDS.glucose.fastingPrediabetesMgdl)
    factors.push("Fasting glucose >=100 mg/dL");

  const additional = Math.max(0, factors.length - 1);
  const burdenLabel: "low" | "moderate" | "high" =
    additional <= 1 ? "low" : additional <= 3 ? "moderate" : "high";
  return { factors, burdenCount: additional, burdenLabel };
}

export function interpretASCVDWithEnhancers(
  baseRisk: number | null,
  enhancerBurden: "low" | "moderate" | "high"
): {
  interpretation: string;
  exploratoryAdjustedRange: string | null;
} {
  if (baseRisk === null) {
    return {
      interpretation:
        "ASCVD base model was unavailable. South Asian risk enhancers still suggest discussing individualized risk with a clinician.",
      exploratoryAdjustedRange: null,
    };
  }

  if (enhancerBurden === "low") {
    return {
      interpretation:
        "Your calculated ASCVD risk may not be strongly affected by additional South Asian risk enhancers.",
      exploratoryAdjustedRange: null,
    };
  }
  if (enhancerBurden === "moderate") {
    return {
      interpretation:
        "Your calculated ASCVD risk may be an underestimate because South Asian ancestry is a recognized risk enhancer.",
      exploratoryAdjustedRange: `${baseRisk.toFixed(1)}% to ${(baseRisk * EXPLORATORY_ASCVD_MULTIPLIERS.moderate).toFixed(1)}%`,
    };
  }
  return {
    interpretation:
      "Your calculated ASCVD risk may meaningfully underestimate cardiometabolic risk because of South Asian risk enhancer burden.",
    exploratoryAdjustedRange: `${baseRisk.toFixed(1)}% to ${(baseRisk * EXPLORATORY_ASCVD_MULTIPLIERS.high).toFixed(1)}%`,
  };
}

function computeFindriscComparison(f: AssessmentFormSnapshot): {
  score: number | null;
  breakdown: FindriscBreakdownItem[] | null;
  percent: number | null;
} {
  if (f.hasDiabetes) return { score: null, breakdown: null, percent: null };
  const bd: FindriscBreakdownItem[] = [];
  let score = 0;
  const agePts = f.age < 45 ? 0 : f.age < 55 ? 2 : f.age < 65 ? 3 : 4;
  score += agePts;
  bd.push({ id: "age", label: "Age", points: agePts });
  const bmi = f.weightKg / Math.pow(f.heightCm / 100, 2);
  const bmiPts = bmi < 25 ? 0 : bmi < 30 ? 1 : 3;
  score += bmiPts;
  bd.push({ id: "bmi", label: "BMI", points: bmiPts });
  let waistPts = 0;
  if (f.sex === "male") waistPts = f.waistCm < 94 ? 0 : f.waistCm <= 102 ? 3 : 4;
  else waistPts = f.waistCm < 80 ? 0 : f.waistCm <= 88 ? 3 : 4;
  score += waistPts;
  bd.push({ id: "waist", label: "Waist", points: waistPts });
  const actPts = f.dailyActivity30Min ? 0 : 2;
  score += actPts;
  bd.push({ id: "activity", label: "Physical activity", points: actPts });
  const vegPts = f.vegetablesOrFruitDaily ? 0 : 1;
  score += vegPts;
  bd.push({ id: "diet", label: "Vegetables/fruit daily", points: vegPts });
  const bpMedPts = f.takesBpMedication ? 2 : 0;
  score += bpMedPts;
  bd.push({ id: "bp_meds", label: "Antihypertensive medication", points: bpMedPts });
  const highG = f.priorHighGlucoseEver || f.fastingGlucoseMmol >= 5.6;
  const histPts = highG ? 5 : 0;
  score += histPts;
  bd.push({ id: "glucose_hist", label: "History of high glucose", points: histPts });
  const famPts = f.familyDiabetes ? 5 : 0;
  score += famPts;
  bd.push({ id: "family", label: "Family diabetes", points: famPts });
  let pct = 0.5;
  if (score <= 6) pct = 1.0;
  else if (score <= 10) pct = 3.6;
  else if (score <= 14) pct = 6.8;
  else if (score <= 19) pct = 13.5;
  else pct = 31;
  return { score, breakdown: bd, percent: pct };
}

export function generatePersonalizedRecommendations(
  f: AssessmentFormSnapshot,
  r: Omit<RiskResult, "recommendations">
): string[] {
  const recs: string[] = [];
  if (r.bmi >= RISK_THRESHOLDS.bmi.overweightLower) {
    recs.push("BMI is above South Asian threshold (>=23); even modest weight loss can improve metabolic markers.");
  }
  if (r.waistToHeightRatio >= RISK_THRESHOLDS.waistToHeightRatio.increasedRisk) {
    recs.push("Waist-to-height ratio is >=0.5, suggesting central adiposity risk even if BMI is not very high.");
  }
  if ((f.hba1cPercent ?? 0) >= RISK_THRESHOLDS.glucose.hba1cPrediabetes) {
    recs.push("HbA1c is in the prediabetes range; discuss confirmatory testing and follow-up intervals with your clinician.");
  }
  if (r.fastingGlucoseMgdl >= RISK_THRESHOLDS.glucose.fastingPrediabetesMgdl) {
    recs.push("Fasting glucose is elevated; consider clinician-guided follow-up for prediabetes screening.");
  }
  if (f.systolicBP >= 120 || f.diastolicBP >= 80) {
    recs.push("Blood pressure is above normal; repeat standardized BP checks and discuss trends with a clinician.");
  }
  if (f.familyDiabetes || f.familyPrematureAscvd) {
    recs.push("Family history suggests earlier and more frequent screening may be appropriate.");
  }
  if (
    r.ascvdTenYearPercent !== null &&
    r.ascvdTenYearPercent >= 5 &&
    r.ascvdEnhancerBurdenLabel !== "low"
  ) {
    recs.push("With borderline/intermediate ASCVD risk plus South Asian enhancers, discuss ApoB, Lp(a), statin eligibility, and coronary artery calcium testing.");
  }
  recs.push("Educational only — not a diagnosis or medical advice. Review results with a licensed clinician.");
  return recs;
}

export function computeFullAssessment(f: AssessmentFormSnapshot): RiskResult {
  const bmi = Math.round((f.weightKg / Math.pow(f.heightCm / 100, 2)) * 10) / 10;
  const bmiStatus = calculateAsianBMIStatus(bmi);
  const whtr = calculateWaistToHeightRatio(f.waistCm, f.heightCm);
  const fastingGlucoseMgdl = Math.round(f.fastingGlucoseMmol * 18);
  const idrs = calculateIDRSBase(f);
  const modifier = calculateDiabetesModifierBurden(f);
  const findrisc = computeFindriscComparison(f);

  const asc = computeAscvdPceWhite({
    age: f.age,
    sex: f.sex,
    totalCholesterolMgdl: f.totalCholesterolMgdl,
    hdlCholesterolMgdl: f.hdlCholesterolMgdl,
    systolicBp: f.systolicBP,
    onBpTreatment: f.takesBpMedication,
    currentSmoker: f.isSmoker,
    hasDiabetes: f.hasDiabetes,
  });
  const ascvdTenYearPercent = "percent" in asc ? asc.percent : null;
  const ascvdUnavailableReason = "unavailableReason" in asc ? asc.unavailableReason : null;
  const ascvdRiskLevel =
    ascvdTenYearPercent !== null ? ascvdRiskLevelFromPercent(ascvdTenYearPercent) : null;
  const enhancer = calculateSouthAsianASCVDEnhancerBurden(f);
  const enhancerInterpretation = interpretASCVDWithEnhancers(
    ascvdTenYearPercent,
    enhancer.burdenLabel
  );
  const bp = accAhaBpCategory(f.systolicBP, f.diastolicBP);

  const resultCore = {
    bmi,
    bmiCategory: bmiStatus.category,
    bmiRisk: bmiStatus.level,
    waistToHeightRatio: Math.round(whtr.ratio * 100) / 100,
    waistToHeightCategory: whtr.category,
    fastingGlucoseMgdl,
    hba1cPercent: f.hba1cPercent ?? null,
    triglyceridesMgdl: f.triglyceridesMgdl ?? null,
    hdlCholesterolMgdl: f.hdlCholesterolMgdl ?? null,
    lpaMgdl: f.lpaMgdl ?? null,
    idrsBaseScore: idrs.score,
    idrsBreakdown: idrs.breakdown,
    idrsBaseRiskLevel: idrs.category,
    idrsEducationalPercent: mapIdrsToEducationalPercent(idrs.score),
    diabetesModifierBurdenCount: modifier.burdenCount,
    diabetesModifierBurdenLevel: modifier.burdenLevel,
    diabetesModifierItems: modifier.modifiers,
    diabetesOverallConcern:
      idrs.category === "high" || modifier.burdenLevel === "high"
        ? "high"
        : idrs.category === "moderate" || modifier.burdenLevel === "moderate"
        ? "moderate"
        : "low",
    findriscScore: findrisc.score,
    findriscBreakdown: findrisc.breakdown,
    findriscTenYearDiabetesPercent: findrisc.percent,
    ascvdTenYearPercent,
    ascvdUnavailableReason,
    ascvdRiskLevel,
    ascvdEnhancerFactors: enhancer.factors,
    ascvdEnhancerBurdenCount: enhancer.burdenCount,
    ascvdEnhancerBurdenLabel: enhancer.burdenLabel,
    ascvdEnhancerInterpretation: enhancerInterpretation.interpretation,
    exploratoryAdjustedRange: enhancerInterpretation.exploratoryAdjustedRange,
    bpCategoryLabel: bp.label,
    bpCategorySeverity: bp.level,
    overallConcernLevel:
      (ascvdRiskLevel === "high" || enhancer.burdenLabel === "high" || modifier.burdenLevel === "high")
        ? "high"
        : (ascvdRiskLevel === "moderate" || enhancer.burdenLabel === "moderate" || modifier.burdenLevel === "moderate")
        ? "moderate"
        : "low",
  } satisfies Omit<RiskResult, "recommendations">;

  return {
    ...resultCore,
    recommendations: generatePersonalizedRecommendations(f, resultCore),
  };
}
