/**
 * Physiology simulation — runs entirely on Vercel Edge (no external backend).
 * TypeScript port of backend/pulse/engine.py (fallback_model path).
 *
 * Scenarios:
 *   cardiovascular_stress  — HR/BP response to 2-min graded exercise
 *   metabolic_syndrome     — 10-year metabolic trajectory
 *   hypertension_treatment — antihypertensive response over 12 weeks
 *   diabetes_progression   — T2DM risk over 5 years
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimRequest {
  age: number;
  sex: string;
  weight_kg: number;
  height_cm: number;
  systolic_bp: number;
  diastolic_bp: number;
  heart_rate: number;
  fasting_glucose_mmol: number;
  hba1c?: number | null;
  has_diabetes: boolean;
  has_hypertension: boolean;
  is_smoker: boolean;
  physical_activity: string;
  scenario: string;
}

interface Profile extends SimRequest {
  bmi: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Box-Muller Gaussian noise */
function gauss(std: number): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
}

function r1(v: number) { return Math.round(v * 10) / 10; }
function r2(v: number) { return Math.round(v * 100) / 100; }

/** Approximate 10-year Framingham CVD risk (%) with South Asian 1.3× factor. */
function framingham10yr(p: Profile): number {
  const raw =
    (p.age * 0.04 +
      p.systolic_bp * 0.02 +
      (p.has_diabetes ? 6 : 0) +
      (p.is_smoker ? 4 : 0)) *
    (p.sex === "male" ? 1.2 : 1.0);
  return Math.min(r1(raw * 1.3), 99.0);
}

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 23.0) return "Normal";
  if (bmi < 27.5) return "Overweight";
  return "Obese";
}

// ── Scenario simulations ──────────────────────────────────────────────────────

function simCardiovascularStress(p: Profile): Record<string, number>[] {
  const hrLimit = (p.age < 50 ? 170 : 150) - (p.has_diabetes || p.has_hypertension ? 10 : 0);
  const pts = [];
  for (let t = 0; t <= 120; t += 5) {
    const stress = Math.sin(Math.min(t / 90, 1) * Math.PI / 2);
    const hr = p.heart_rate + stress * (hrLimit - p.heart_rate);
    const sbp = p.systolic_bp + stress * 30 * (p.has_hypertension ? 1.1 : 1.0);
    const dbp = p.diastolic_bp + stress * 5;
    pts.push({
      time_s: t,
      heart_rate: r1(hr + gauss(0.8)),
      systolic_bp: r1(sbp + gauss(0.8)),
      diastolic_bp: r1(dbp + gauss(0.8)),
      cardiac_output_L_min: r2((hr * 70) / 1000 + gauss(0.1)),
    });
  }
  return pts;
}

function simMetabolicSyndrome(p: Profile): Record<string, number>[] {
  const hba1c = p.hba1c ?? p.fasting_glucose_mmol * 0.33 + 1.5;
  const SA = 1.35;
  const pts = [];
  for (let year = 0; year <= 10; year++) {
    const bmIncrease = year * 0.15 * (p.physical_activity === "sedentary" ? 1.2 : 0.8);
    const curBmi = p.bmi + bmIncrease;
    let gDrift = year * 0.08 * SA;
    if (curBmi >= 25) gDrift *= 1.2;
    pts.push({
      year,
      bmi: r1(curBmi),
      fasting_glucose_mmol: r2(p.fasting_glucose_mmol + gDrift),
      hba1c_percent: r1(Math.min(hba1c + year * 0.06 * SA, 12.0)),
      systolic_bp: r1(p.systolic_bp + year * 0.5 * (p.has_hypertension ? 1.3 : 1.0)),
      cvd_risk_10yr_percent: r1(framingham10yr(p) * (1 + year * 0.04)),
    });
  }
  return pts;
}

function simHypertensionTreatment(p: Profile): Record<string, number>[] {
  const pts = [];
  for (let week = 0; week <= 12; week++) {
    const frac = 1 - Math.exp(-week / 3);
    const sbpRed = 18 * frac;
    const dbpRed = 10 * frac;
    pts.push({
      week,
      systolic_bp: r1(p.systolic_bp - sbpRed + gauss(1.2)),
      diastolic_bp: r1(p.diastolic_bp - dbpRed + gauss(1.2)),
      pulse_pressure: r1((p.systolic_bp - sbpRed) - (p.diastolic_bp - dbpRed)),
      estimated_cvd_risk_reduction_percent: r1(Math.min(sbpRed * 0.7, 25.0)),
    });
  }
  return pts;
}

function simDiabetesProgression(p: Profile): Record<string, number>[] {
  const baseHba1c = p.hba1c ?? p.fasting_glucose_mmol * 0.33 + 1.5;
  const SA = 1.4;
  const lifestyle = ["moderate", "active"].includes(p.physical_activity) ? 0.9 : 1.0;
  const pts = [];
  for (let year = 0; year <= 5; year++) {
    const glucose = p.fasting_glucose_mmol + year * 0.12 * SA * lifestyle;
    const hba1c = baseHba1c + year * 0.05 * SA * lifestyle;
    const rawRisk = (glucose - 5.0) * 8 * SA + (p.bmi - 23) * 2.5 + year * 2.5;
    pts.push({
      year,
      fasting_glucose_mmol: r2(Math.max(glucose, 3.5)),
      hba1c_percent: r1(Math.min(hba1c, 12.0)),
      t2dm_5yr_risk_percent: r1(Math.max(p.has_diabetes ? 100 : rawRisk, 0)),
      recommended_hba1c_target: 7.0,
    });
  }
  return pts;
}

function clinicalNotes(p: Profile, scenario: string): string[] {
  const notes: string[] = [];
  if (p.bmi >= 23.0)
    notes.push(
      `BMI ${p.bmi.toFixed(1)} kg/m² — above the South Asian overweight threshold of 23 kg/m². Standard Western thresholds (≥25) may underestimate cardiometabolic risk.`
    );
  if (p.fasting_glucose_mmol >= 5.6)
    notes.push(
      "Fasting glucose ≥5.6 mmol/L indicates impaired fasting glycaemia. South Asians have a 3-5x higher lifetime risk of T2DM vs white Europeans."
    );
  if (p.systolic_bp >= 130)
    notes.push(
      "Blood pressure ≥130/80 mmHg. Calcium channel blockers are often preferred over ACE inhibitors as first-line agents in South Asian hypertension."
    );
  if (scenario === "metabolic_syndrome" && p.bmi >= 23.0)
    notes.push(
      "South Asian-specific waist circumference thresholds: ≥90 cm (men), ≥80 cm (women) indicate central obesity risk (IDF criteria for South Asians)."
    );
  notes.push(
    "All simulation results are for educational purposes only. Consult a qualified healthcare provider for clinical decisions."
  );
  return notes;
}

const SCENARIO_LABELS: Record<string, string> = {
  cardiovascular_stress: "Cardiovascular Stress Response",
  metabolic_syndrome: "Metabolic Syndrome Progression (10-year)",
  hypertension_treatment: "Antihypertensive Treatment Response (12-week)",
  diabetes_progression: "Type 2 Diabetes Risk Trajectory (5-year)",
};

const SCENARIO_META: Record<string, { x_axis: string; x_label: string; metrics: string[] }> = {
  cardiovascular_stress: {
    x_axis: "time_s",
    x_label: "Time (seconds)",
    metrics: ["heart_rate", "systolic_bp", "diastolic_bp", "cardiac_output_L_min"],
  },
  metabolic_syndrome: {
    x_axis: "year",
    x_label: "Year",
    metrics: ["bmi", "fasting_glucose_mmol", "hba1c_percent", "cvd_risk_10yr_percent"],
  },
  hypertension_treatment: {
    x_axis: "week",
    x_label: "Week",
    metrics: ["systolic_bp", "diastolic_bp", "estimated_cvd_risk_reduction_percent"],
  },
  diabetes_progression: {
    x_axis: "year",
    x_label: "Year",
    metrics: ["fasting_glucose_mmol", "hba1c_percent", "t2dm_5yr_risk_percent"],
  },
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SimRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    age, sex, weight_kg, height_cm,
    systolic_bp, diastolic_bp, heart_rate,
    fasting_glucose_mmol, hba1c,
    has_diabetes, has_hypertension, is_smoker,
    physical_activity, scenario,
  } = body;

  // Basic validation
  if (!scenario || !SCENARIO_META[scenario]) {
    return NextResponse.json({ error: `Unknown scenario: ${scenario}` }, { status: 400 });
  }

  const bmi = weight_kg / Math.pow(height_cm / 100, 2);
  const profile: Profile = {
    age, sex, weight_kg, height_cm,
    systolic_bp, diastolic_bp, heart_rate,
    fasting_glucose_mmol, hba1c: hba1c ?? null,
    has_diabetes, has_hypertension, is_smoker,
    physical_activity, scenario, bmi,
  };

  let data: Record<string, number>[];
  switch (scenario) {
    case "cardiovascular_stress":  data = simCardiovascularStress(profile);  break;
    case "metabolic_syndrome":     data = simMetabolicSyndrome(profile);     break;
    case "hypertension_treatment": data = simHypertensionTreatment(profile); break;
    case "diabetes_progression":   data = simDiabetesProgression(profile);   break;
    default:                       data = simCardiovascularStress(profile);
  }

  const meta = SCENARIO_META[scenario];

  return NextResponse.json({
    scenario,
    scenario_label: SCENARIO_LABELS[scenario] ?? scenario,
    engine: "vercel_edge",
    x_axis: meta.x_axis,
    x_label: meta.x_label,
    metrics: meta.metrics,
    patient_summary: {
      age,
      sex,
      bmi: r1(bmi),
      bmi_category_south_asian: bmiCategory(bmi),
      cvd_risk_10yr_percent: framingham10yr(profile),
    },
    data,
    clinical_notes: clinicalNotes(profile, scenario),
  });
}
