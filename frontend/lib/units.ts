/**
 * Glucose: mmol/L (SI) <-> mg/dL (US)
 * 1 mmol/L ≈ 18.0182 mg/dL; we use 18 for display consistency.
 */
export const MMOL_TO_MGDL = 18;
export const mgdlToMmol = (mgdl: number) => Math.round((mgdl / MMOL_TO_MGDL) * 100) / 100;
export const mmolToMgdl = (mmol: number) => Math.round(mmol * MMOL_TO_MGDL * 10) / 10;

const GLU = "fasting_glucose_mmol";

/** One chart row: convert display values for the glucose series when using US (mg/dL). */
export function mapRowForDisplay(
  row: Record<string, number>,
  useMetric: boolean
): Record<string, number> {
  if (useMetric) return { ...row };
  const out = { ...row };
  if (typeof out[GLU] === "number") {
    out[GLU] = mmolToMgdl(out[GLU]);
  }
  return out;
}

/** Y-axis reference lines: metric uses mmol/L cutoffs, US uses mg/dL. */
export function referenceLinesForMetric(
  metric: string,
  useMetric: boolean
): { value: number; label: string; color: string }[] {
  if (metric === GLU) {
    if (useMetric) {
      return [
        { value: 5.6, label: "IFG threshold (5.6 mmol/L)", color: "#f59e0b" },
        { value: 7.0, label: "Diabetes (7.0 mmol/L)", color: "#ef4444" },
      ];
    }
    return [
      { value: 100, label: "IFG (≈5.6 mmol/L)", color: "#f59e0b" },
      { value: 126, label: "Diabetes (7.0 mmol/L)", color: "#ef4444" },
    ];
  }
  if (metric === "systolic_bp") {
    return [{ value: 130, label: "High BP (130 mmHg)", color: "#ef4444" }];
  }
  if (metric === "diastolic_bp") {
    return [{ value: 80, label: "High BP (80 mmHg)", color: "#ef4444" }];
  }
  if (metric === "hba1c_percent") {
    return [
      { value: 6.5, label: "Diabetes (6.5%)", color: "#ef4444" },
      { value: 7.0, label: "Common target (7%)", color: "#3b82f6" },
    ];
  }
  if (metric === "bmi") {
    return [
      { value: 23.0, label: "Overweight (SA) 23", color: "#f59e0b" },
      { value: 27.5, label: "Obese (SA) 27.5", color: "#ef4444" },
    ];
  }
  return [];
}

export function buildChartMetricLabels(useMetric: boolean): Record<string, string> {
  const g = useMetric ? "Fasting glucose (mmol/L)" : "Fasting glucose (mg/dL)";
  return {
    heart_rate: "Heart rate (bpm)",
    systolic_bp: "Systolic (mmHg)",
    diastolic_bp: "Diastolic (mmHg)",
    cardiac_output_L_min: "Cardiac output (L/min)",
    bmi: "BMI (kg/m²)",
    fasting_glucose_mmol: g,
    hba1c_percent: "HbA1c (%)",
    cvd_risk_10yr_percent: "Illustrative CV trajectory (%) — not ACC/AHA ASCVD",
    estimated_cvd_risk_reduction_percent: "CVD risk reduction (%)",
    pulse_pressure: "Pulse pressure (mmHg)",
    t2dm_5yr_risk_percent: "5-yr T2DM risk (%)",
    recommended_hba1c_target: "HbA1c target (%)",
  };
}

/** Soften raw backend copy that cited mmol/L when showing US. */
export function formatClinicalNoteForDisplay(note: string, useMetric: boolean): string {
  if (useMetric) return note;
  return note
    .replace(/≥5\.6 mmol\/L/g, "≥100 mg/dL")
    .replace(/5\.6 mmol\/L/g, "100 mg/dL");
}
