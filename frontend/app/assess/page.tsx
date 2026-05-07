"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssessForm {
  // Step 1: Demographics
  age: number;
  sex: "male" | "female";
  ethnicity: string;
  familyDiabetes: boolean;
  familyCVD: boolean;
  familyHypertension: boolean;
  // Step 2: Body metrics
  weightKg: number;
  heightCm: number;
  waistCm: number;
  useImperial: boolean;
  // Step 3: Lifestyle
  dietQuality: "poor" | "fair" | "good";
  physicalActivity: "sedentary" | "moderate" | "active";
  sleepHours: number;
  isSmoker: boolean;
  drinksAlcohol: boolean;
  // Step 4: Known conditions
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasCVD: boolean;
  systolicBP: number;
  fastingGlucose: number;
}

interface RiskResult {
  bmi: number;
  bmiCategory: string;
  bmiRisk: "low" | "moderate" | "high";
  diabetesRisk5yr: number;
  diabetesRiskLevel: "low" | "moderate" | "high";
  cvdRisk10yr: number;
  cvdRiskLevel: "low" | "moderate" | "high";
  hypertensionRisk: number;
  hypertensionRiskLevel: "low" | "moderate" | "high";
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Risk calculations (South Asian–calibrated)
// ---------------------------------------------------------------------------

function computeRisk(f: AssessForm): RiskResult {
  const bmi = f.weightKg / Math.pow(f.heightCm / 100, 2);

  // South Asian BMI categories (WHO Asia-Pacific)
  const bmiCategory =
    bmi < 18.5 ? "Underweight"
    : bmi < 23 ? "Normal weight"
    : bmi < 27.5 ? "Overweight"
    : "Obese";
  const bmiRisk: "low" | "moderate" | "high" = bmi < 23 ? "low" : bmi < 27.5 ? "moderate" : "high";

  // T2DM 5-year risk — South Asian FINDRISC adaptation
  let dmScore = 0;
  if (f.age >= 45 && f.age < 55) dmScore += 2;
  else if (f.age >= 55 && f.age < 65) dmScore += 3;
  else if (f.age >= 65) dmScore += 4;
  if (bmi >= 23 && bmi < 27.5) dmScore += 2;
  else if (bmi >= 27.5) dmScore += 3;
  if (f.waistCm > (f.sex === "male" ? 90 : 80)) dmScore += 3; // South Asian thresholds
  if (f.physicalActivity === "sedentary") dmScore += 2;
  if (f.dietQuality === "poor") dmScore += 1;
  if (f.familyDiabetes) dmScore += 5;
  if (f.fastingGlucose >= 5.6) dmScore += 5;
  if (f.hasDiabetes) dmScore = 25;
  // South Asian amplification: 1.4× base risk
  const diabetesRisk5yr = Math.min(dmScore * 1.4 * 1.8, 95);
  const diabetesRiskLevel: "low" | "moderate" | "high" =
    diabetesRisk5yr < 20 ? "low" : diabetesRisk5yr < 50 ? "moderate" : "high";

  // CVD 10-year risk — Framingham with South Asian 1.3× multiplier
  const agePts = f.age * 0.04;
  const sbpPts = f.systolicBP * 0.02;
  const diabetesPts = f.hasDiabetes ? 6 : 0;
  const smokerPts = f.isSmoker ? 4 : 0;
  const sexMul = f.sex === "male" ? 1.2 : 1.0;
  const familyCvdPts = f.familyCVD ? 2 : 0;
  const hypertensionPts = f.hasHypertension ? 2 : 0;
  const rawCVD = (agePts + sbpPts + diabetesPts + smokerPts + familyCvdPts + hypertensionPts) * sexMul * 1.3;
  const cvdRisk10yr = Math.min(Math.round(rawCVD * 10) / 10, 99);
  const cvdRiskLevel: "low" | "moderate" | "high" =
    cvdRisk10yr < 10 ? "low" : cvdRisk10yr < 20 ? "moderate" : "high";

  // Hypertension risk score
  let htScore = 0;
  if (f.age >= 40) htScore += 2;
  if (f.age >= 60) htScore += 2;
  if (bmi >= 25) htScore += 2;
  if (f.familyHypertension) htScore += 3;
  if (f.isSmoker) htScore += 1;
  if (f.physicalActivity === "sedentary") htScore += 2;
  if (f.dietQuality === "poor") htScore += 1;
  if (f.drinksAlcohol) htScore += 1;
  if (f.hasHypertension || f.systolicBP >= 130) htScore += 6;
  const hypertensionRisk = Math.min(htScore * 6, 95);
  const hypertensionRiskLevel: "low" | "moderate" | "high" =
    hypertensionRisk < 25 ? "low" : hypertensionRisk < 55 ? "moderate" : "high";

  // Lifestyle recommendations
  const recommendations: string[] = [];
  if (bmi >= 23)
    recommendations.push("Your BMI is above the South Asian overweight threshold of 23 kg/m². Even modest weight loss of 5–7% significantly reduces diabetes risk.");
  if (f.waistCm > (f.sex === "male" ? 90 : 80))
    recommendations.push(`Your waist circumference exceeds South Asian thresholds (${f.sex === "male" ? "90cm for men" : "80cm for women"}), indicating central obesity — a key risk factor for T2DM and CVD.`);
  if (f.physicalActivity === "sedentary")
    recommendations.push("Increasing to 150 minutes of moderate activity per week can reduce T2DM risk by up to 58% (Diabetes Prevention Program).");
  if (f.isSmoker)
    recommendations.push("Smoking doubles cardiovascular risk. Quitting is the single most impactful change you can make for heart health.");
  if (f.familyDiabetes)
    recommendations.push("With a family history of diabetes, annual fasting glucose screening is recommended. South Asians should begin screening from age 30.");
  if (f.dietQuality === "poor")
    recommendations.push("Reducing refined carbohydrates (white rice, white bread) and adding more legumes, vegetables, and fibre significantly improves glycaemic control.");
  if (f.sleepHours < 6)
    recommendations.push("Short sleep (< 6 hours) is independently associated with insulin resistance and increased T2DM risk.");
  recommendations.push("All risk scores are educational estimates. Consult a qualified healthcare provider for clinical evaluation and screening.");

  return { bmi: Math.round(bmi * 10) / 10, bmiCategory, bmiRisk, diabetesRisk5yr: Math.round(diabetesRisk5yr), diabetesRiskLevel, cvdRisk10yr, cvdRiskLevel, hypertensionRisk: Math.round(hypertensionRisk), hypertensionRiskLevel, recommendations };
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

const RISK_COLORS = {
  low: { bg: "bg-[var(--success-bg)]", border: "border-[var(--success-border)]", text: "text-[var(--success)]", label: "Low Risk", bar: "bg-[var(--success)]" },
  moderate: { bg: "bg-[var(--warning-bg)]", border: "border-amber-200", text: "text-amber-700", label: "Moderate Risk", bar: "bg-amber-500" },
  high: { bg: "bg-[var(--danger-bg)]", border: "border-red-200", text: "text-[var(--danger)]", label: "High Risk", bar: "bg-[var(--danger)]" },
};

function RiskCard({ title, value, unit, level, description }: { title: string; value: number; unit: string; level: "low" | "moderate" | "high"; description: string }) {
  const style = RISK_COLORS[level];
  const barWidth = Math.min(value, 100);
  return (
    <div className={cn("rounded-2xl border p-5", style.bg, style.border)}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-sm text-[var(--foreground)]">{title}</h3>
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", style.bg, style.text, "border", style.border)}>
          {style.label}
        </span>
      </div>
      <div className="flex items-end gap-2 mb-3">
        <span className={cn("text-3xl font-extrabold", style.text)}>{value}</span>
        <span className="text-sm text-[var(--muted-foreground)] mb-1">{unit}</span>
      </div>
      <div className="w-full bg-white/60 rounded-full h-2 mb-3">
        <div className={cn("h-2 rounded-full transition-all", style.bar)} style={{ width: `${barWidth}%` }} />
      </div>
      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{description}</p>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={cn("h-1.5 rounded-full transition-all", i < current ? "flex-1 bg-[var(--primary)]" : i === current ? "flex-1 bg-[var(--primary)]" : "flex-1 bg-[var(--card-border)]")} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const defaultForm: AssessForm = {
  age: 38,
  sex: "male",
  ethnicity: "indian",
  familyDiabetes: false,
  familyCVD: false,
  familyHypertension: false,
  weightKg: 75,
  heightCm: 168,
  waistCm: 88,
  useImperial: false,
  dietQuality: "fair",
  physicalActivity: "moderate",
  sleepHours: 7,
  isSmoker: false,
  drinksAlcohol: false,
  hasDiabetes: false,
  hasHypertension: false,
  hasCVD: false,
  systolicBP: 125,
  fastingGlucose: 5.4,
};

const TOTAL_STEPS = 4;

export default function AssessPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AssessForm>(defaultForm);
  const [result, setResult] = useState<RiskResult | null>(null);

  const update = (patch: Partial<AssessForm>) => setForm((f) => ({ ...f, ...patch }));

  const handleFinish = () => {
    setResult(computeRisk(form));
    setStep(TOTAL_STEPS);
  };

  const kgToLbs = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;
  const lbsToKg = (lbs: number) => Math.round(lbs * 0.453592 * 10) / 10;
  const cmToIn = (cm: number) => Math.round(cm / 2.54 * 10) / 10;
  const inToCm = (inch: number) => Math.round(inch * 2.54 * 10) / 10;

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors";
  const selectCls = inputCls;
  const labelCls = "block text-sm font-medium text-[var(--foreground)] mb-1";

  const OptionButton = ({ value, current, label, onChange }: { value: string; current: string; label: string; onChange: (v: string) => void }) => (
    <button
      onClick={() => onChange(value)}
      className={cn(
        "flex-1 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all",
        current === value
          ? "border-[var(--primary)] bg-[var(--sidebar-active)] text-[var(--primary)]"
          : "border-[var(--card-border)] bg-white text-[var(--muted-foreground)] hover:border-[var(--primary)]/40"
      )}
    >
      {label}
    </button>
  );

  const CheckRow = ({ label, checked, onChange, desc }: { label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string }) => (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-[var(--primary)] flex-shrink-0"
      />
      <span className="flex-1">
        <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
        {desc && <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">{desc}</span>}
      </span>
    </label>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 w-full">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 mb-4 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to Home
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Personal Health Risk Assessment</h1>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          Answer 4 short sections to receive your personalised South Asian health risk scores — computed using clinically validated formulas.
        </p>
      </div>

      {step < TOTAL_STEPS && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-2">
            <span>Step {step + 1} of {TOTAL_STEPS}</span>
            <span>{["Demographics", "Body Metrics", "Lifestyle", "Medical History"][step]}</span>
          </div>
          <StepIndicator current={step} total={TOTAL_STEPS} />
        </div>
      )}

      <div className="bg-white border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">

        {/* ── STEP 0: Demographics ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-[var(--foreground)]">Demographics & Family History</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Age</label>
                <input type="number" min={18} max={100} value={form.age} onChange={(e) => update({ age: parseInt(e.target.value) || 18 })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Sex</label>
                <div className="flex gap-2">
                  <OptionButton value="male" current={form.sex} label="Male" onChange={(v) => update({ sex: v as "male" | "female" })} />
                  <OptionButton value="female" current={form.sex} label="Female" onChange={(v) => update({ sex: v as "male" | "female" })} />
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>South Asian background</label>
              <select value={form.ethnicity} onChange={(e) => update({ ethnicity: e.target.value })} className={selectCls}>
                <option value="indian">Indian</option>
                <option value="pakistani">Pakistani</option>
                <option value="bangladeshi">Bangladeshi</option>
                <option value="sri_lankan">Sri Lankan</option>
                <option value="nepali">Nepali</option>
                <option value="other_sa">Other South Asian</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Family history — check all that apply</label>
              <div className="border border-[var(--card-border)] rounded-xl px-4 divide-y divide-[var(--card-border)]">
                <CheckRow label="Parent or sibling with Type 2 Diabetes" checked={form.familyDiabetes} onChange={(v) => update({ familyDiabetes: v })} />
                <CheckRow label="Parent or sibling with heart disease" checked={form.familyCVD} onChange={(v) => update({ familyCVD: v })} desc="Heart attack, stroke, or angina before age 65" />
                <CheckRow label="Parent or sibling with high blood pressure" checked={form.familyHypertension} onChange={(v) => update({ familyHypertension: v })} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: Body metrics ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--foreground)]">Body Measurements</h2>
              <div className="flex items-center gap-0.5 bg-[var(--muted)] rounded-lg p-0.5 text-xs">
                <button onClick={() => update({ useImperial: false })} className={cn("px-2 py-1 rounded-md font-medium transition-all", !form.useImperial ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}>Metric</button>
                <button onClick={() => update({ useImperial: true })} className={cn("px-2 py-1 rounded-md font-medium transition-all", form.useImperial ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}>Imperial</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{form.useImperial ? "Weight (lbs)" : "Weight (kg)"}</label>
                <input
                  type="number"
                  value={form.useImperial ? kgToLbs(form.weightKg) : form.weightKg}
                  onChange={(e) => update({ weightKg: form.useImperial ? lbsToKg(parseFloat(e.target.value)) : parseFloat(e.target.value) })}
                  step={0.1} min={form.useImperial ? 66 : 30} max={form.useImperial ? 660 : 300}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{form.useImperial ? "Height (inches)" : "Height (cm)"}</label>
                <input
                  type="number"
                  value={form.useImperial ? cmToIn(form.heightCm) : form.heightCm}
                  onChange={(e) => update({ heightCm: form.useImperial ? inToCm(parseFloat(e.target.value)) : parseFloat(e.target.value) })}
                  step={0.5} min={form.useImperial ? 48 : 100} max={form.useImperial ? 96 : 250}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Live BMI preview */}
            {(() => {
              const bmi = form.weightKg / Math.pow(form.heightCm / 100, 2);
              const cat = bmi < 18.5 ? "Underweight" : bmi < 23 ? "Normal" : bmi < 27.5 ? "Overweight" : "Obese";
              const color = bmi < 23 ? "text-[var(--success)]" : bmi < 27.5 ? "text-amber-600" : "text-[var(--danger)]";
              return (
                <div className="flex items-center gap-3 bg-[var(--muted)] rounded-xl px-4 py-3">
                  <span className="text-xs text-[var(--muted-foreground)]">Your BMI (South Asian scale):</span>
                  <span className={cn("font-bold text-sm", color)}>{bmi.toFixed(1)} — {cat}</span>
                </div>
              );
            })()}

            <div>
              <label className={labelCls}>{form.useImperial ? "Waist circumference (inches)" : "Waist circumference (cm)"}</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-2">Measure at the navel level. South Asian thresholds: ≥90 cm (men) / ≥80 cm (women).</p>
              <input
                type="number"
                value={form.useImperial ? cmToIn(form.waistCm) : form.waistCm}
                onChange={(e) => update({ waistCm: form.useImperial ? inToCm(parseFloat(e.target.value)) : parseFloat(e.target.value) })}
                step={0.5} min={form.useImperial ? 20 : 50} max={form.useImperial ? 80 : 200}
                className={inputCls}
              />
              {form.waistCm > (form.sex === "male" ? 90 : 80) && (
                <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 flex-shrink-0"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Above South Asian central obesity threshold — indicates elevated metabolic risk.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Lifestyle ── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-[var(--foreground)]">Lifestyle</h2>

            <div>
              <label className={labelCls}>Physical activity level</label>
              <div className="flex gap-2">
                {[
                  { v: "sedentary", l: "Sedentary" },
                  { v: "moderate", l: "Moderate" },
                  { v: "active", l: "Active" },
                ].map(({ v, l }) => (
                  <OptionButton key={v} value={v} current={form.physicalActivity} label={l} onChange={(val) => update({ physicalActivity: val as AssessForm["physicalActivity"] })} />
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
                Sedentary = desk job, little movement · Moderate = 2–3 workouts/week · Active = daily exercise
              </p>
            </div>

            <div>
              <label className={labelCls}>Diet quality</label>
              <div className="flex gap-2">
                {[{ v: "poor", l: "Poor" }, { v: "fair", l: "Fair" }, { v: "good", l: "Good" }].map(({ v, l }) => (
                  <OptionButton key={v} value={v} current={form.dietQuality} label={l} onChange={(val) => update({ dietQuality: val as AssessForm["dietQuality"] })} />
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
                Poor = high refined carbs, low veg · Fair = mixed · Good = whole foods, low sugar
              </p>
            </div>

            <div>
              <label className={labelCls}>Average sleep per night: <strong>{form.sleepHours} hours</strong></label>
              <input
                type="range" min={3} max={12} step={0.5}
                value={form.sleepHours}
                onChange={(e) => update({ sleepHours: parseFloat(e.target.value) })}
                className="w-full accent-[var(--primary)]"
              />
              <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-0.5">
                <span>3 hrs</span><span className="text-[var(--success)]">7–9 hrs recommended</span><span>12 hrs</span>
              </div>
            </div>

            <div className="border border-[var(--card-border)] rounded-xl px-4 divide-y divide-[var(--card-border)]">
              <CheckRow label="I currently smoke" checked={form.isSmoker} onChange={(v) => update({ isSmoker: v })} desc="Any tobacco use including cigarettes, bidis, or hookah" />
              <CheckRow label="I drink alcohol regularly" checked={form.drinksAlcohol} onChange={(v) => update({ drinksAlcohol: v })} desc="More than 2–3 drinks per week" />
            </div>
          </div>
        )}

        {/* ── STEP 3: Medical history ── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-[var(--foreground)]">Medical History</h2>

            <div className="border border-[var(--card-border)] rounded-xl px-4 divide-y divide-[var(--card-border)]">
              <CheckRow label="I have been diagnosed with Type 2 Diabetes" checked={form.hasDiabetes} onChange={(v) => update({ hasDiabetes: v })} />
              <CheckRow label="I have been diagnosed with Hypertension" checked={form.hasHypertension} onChange={(v) => update({ hasHypertension: v })} desc="High blood pressure" />
              <CheckRow label="I have had a heart attack or stroke" checked={form.hasCVD} onChange={(v) => update({ hasCVD: v })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Blood pressure — systolic</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">The top number. If unsure, enter 120.</p>
                <div className="relative">
                  <input type="number" min={70} max={250} value={form.systolicBP} onChange={(e) => update({ systolicBP: parseInt(e.target.value) || 120 })} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmHg</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Fasting blood glucose</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">If unsure, enter 5.0 (normal).</p>
                <div className="relative">
                  <input type="number" min={2} max={30} step={0.1} value={form.fastingGlucose} onChange={(e) => update({ fastingGlucose: parseFloat(e.target.value) || 5.0 })} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmol/L</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === TOTAL_STEPS && result && (
          <div className="space-y-6">
            <div>
              <h2 className="font-bold text-lg text-[var(--foreground)] mb-1">Your Risk Profile</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Computed using South Asian–calibrated clinical formulas. These are risk estimates, not diagnoses.
              </p>
            </div>

            {/* BMI */}
            <div className={cn("rounded-xl border p-4 flex items-center gap-4", RISK_COLORS[result.bmiRisk].bg, RISK_COLORS[result.bmiRisk].border)}>
              <div className="text-center flex-shrink-0">
                <div className={cn("text-3xl font-extrabold", RISK_COLORS[result.bmiRisk].text)}>{result.bmi}</div>
                <div className="text-xs text-[var(--muted-foreground)]">BMI</div>
              </div>
              <div>
                <p className="font-semibold text-sm text-[var(--foreground)]">{result.bmiCategory} <span className={cn("ml-1 text-xs font-bold", RISK_COLORS[result.bmiRisk].text)}>({RISK_COLORS[result.bmiRisk].label})</span></p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">Using South Asian WHO thresholds: ≥23 overweight, ≥27.5 obese</p>
              </div>
            </div>

            {/* Risk cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <RiskCard
                title="5-Year Diabetes Risk"
                value={result.diabetesRisk5yr}
                unit="% risk"
                level={result.diabetesRiskLevel}
                description="South Asian-calibrated FINDRISC score. South Asians develop T2DM at 3–5× the rate of white Europeans."
              />
              <RiskCard
                title="10-Year CVD Risk"
                value={result.cvdRisk10yr}
                unit="% risk"
                level={result.cvdRiskLevel}
                description="Framingham score × 1.3 South Asian amplification. Accounts for family history, BP, diabetes, and smoking."
              />
              <RiskCard
                title="Hypertension Risk"
                value={result.hypertensionRisk}
                unit="% risk"
                level={result.hypertensionRiskLevel}
                description="Based on age, BMI, family history, lifestyle factors, and South Asian central obesity thresholds."
              />
            </div>

            {/* Recommendations */}
            <div className="bg-white border border-[var(--card-border)] rounded-2xl p-5">
              <h3 className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-lg bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[var(--primary)]">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Personalised Recommendations
              </h3>
              <div className="space-y-2.5">
                {result.recommendations.map((rec, i) => {
                  const isDisclaimer = i === result.recommendations.length - 1;
                  if (isDisclaimer) return (
                    <p key={i} className="text-xs text-[var(--muted-foreground)] italic border-t border-[var(--card-border)] pt-2.5 mt-2">{rec}</p>
                  );
                  return (
                    <div key={i} className="flex items-start gap-3 bg-[var(--accent)] border border-[var(--accent-border)] rounded-xl px-4 py-3">
                      <span className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-sm text-[var(--foreground)] leading-relaxed">{rec}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/chat" className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold text-center hover:bg-[var(--primary-hover)] transition-colors">
                Ask questions about your results →
              </Link>
              <Link href="/simulate" className="flex-1 py-3 rounded-xl border border-[var(--card-border)] bg-white text-sm font-semibold text-center text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                Run a physiology simulation →
              </Link>
            </div>

            <button onClick={() => { setStep(0); setResult(null); }} className="w-full text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-1 transition-colors">
              ← Start over
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        {step < TOTAL_STEPS && (
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                ← Back
              </button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} className="flex-1 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors">
                Continue →
              </button>
            ) : (
              <button onClick={handleFinish} className="flex-1 py-2.5 rounded-xl bg-[var(--saffron)] text-white text-sm font-semibold hover:bg-[var(--saffron-hover)] transition-colors">
                Show My Risk Profile →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
