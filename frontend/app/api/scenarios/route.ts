import { NextResponse } from "next/server";

export const runtime = "edge";

const SCENARIOS = [
  {
    id: "cardiovascular_stress",
    label: "How Your Heart Responds to Exercise",
    description:
      "See how your heart rate and blood pressure change during a 2-minute workout.",
    x_axis: "time_s",
    x_label: "Time (seconds)",
    metrics: ["heart_rate", "systolic_bp", "diastolic_bp", "cardiac_output_L_min"],
  },
  {
    id: "metabolic_syndrome",
    label: "My Health Over the Next 10 Years",
    description:
      "See how weight, blood sugar, and heart disease risk may evolve if current habits continue.",
    x_axis: "year",
    x_label: "Year",
    metrics: ["bmi", "fasting_glucose_mmol", "hba1c_percent", "cvd_risk_10yr_percent"],
  },
  {
    id: "hypertension_treatment",
    label: "Blood Pressure Treatment Progress",
    description:
      "See how blood pressure medication could lower your readings over 12 weeks.",
    x_axis: "week",
    x_label: "Week",
    metrics: ["systolic_bp", "diastolic_bp", "estimated_cvd_risk_reduction_percent"],
  },
  {
    id: "diabetes_progression",
    label: "Diabetes Risk Over Time",
    description:
      "Track how blood sugar and diabetes risk may change over the next 5 years.",
    x_axis: "year",
    x_label: "Year",
    metrics: ["fasting_glucose_mmol", "hba1c_percent", "t2dm_5yr_risk_percent"],
  },
];

export async function GET() {
  return NextResponse.json({ scenarios: SCENARIOS });
}
