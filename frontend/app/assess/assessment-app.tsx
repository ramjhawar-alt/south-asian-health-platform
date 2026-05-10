"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { mmolToMgdl, mgdlToMmol } from "@/lib/units";
import type { RiskResult } from "@/lib/risk-screener";
import { storeRiskScreenerForChat } from "@/lib/risk-screener";
import { computeFullAssessment } from "@/lib/risk-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssessForm {
  age: number;
  sex: "male" | "female";
  ethnicity: string;
  familyDiabetes: boolean;
  familyCVD: boolean;
  familyHypertension: boolean;
  weightKg: number;
  heightCm: number;
  waistCm: number;
  useImperial: boolean;
  dietQuality: "poor" | "fair" | "good";
  physicalActivity: "sedentary" | "moderate" | "active";
  sleepHours: number;
  isSmoker: boolean;
  drinksAlcohol: boolean;
  /** FINDRISC — ≥30 min activity most days */
  dailyActivity30Min: boolean;
  /** FINDRISC — vegetables or fruit daily */
  vegetablesOrFruitDaily: boolean;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasCVD: boolean;
  systolicBP: number;
  diastolicBP: number;
  fastingGlucose: number;
  hba1cPercent: number | null;
  triglyceridesMgdl: number | null;
  lpaMgdl: number | null;
  takesBpMedication: boolean;
  priorHighGlucoseEver: boolean;
  hadGestationalDiabetes: boolean;
  totalCholesterolMgdl: number;
  hdlCholesterolMgdl: number;
}

function formToAssessmentSnapshot(f: AssessForm) {
  return {
    age: f.age,
    sex: f.sex,
    weightKg: f.weightKg,
    heightCm: f.heightCm,
    waistCm: f.waistCm,
    dailyActivity30Min: f.dailyActivity30Min,
    vegetablesOrFruitDaily: f.vegetablesOrFruitDaily,
    takesBpMedication: f.takesBpMedication,
    priorHighGlucoseEver: f.priorHighGlucoseEver,
    fastingGlucoseMmol: f.fastingGlucose,
    hba1cPercent: f.hba1cPercent,
    triglyceridesMgdl: f.triglyceridesMgdl,
    lpaMgdl: f.lpaMgdl,
    familyDiabetes: f.familyDiabetes,
    familyPrematureAscvd: f.familyCVD,
    hasDiabetes: f.hasDiabetes,
    hasHypertension: f.hasHypertension,
    hadGestationalDiabetes: f.hadGestationalDiabetes,
    isSmoker: f.isSmoker,
    systolicBP: f.systolicBP,
    diastolicBP: f.diastolicBP,
    totalCholesterolMgdl: f.totalCholesterolMgdl,
    hdlCholesterolMgdl: f.hdlCholesterolMgdl,
    physicalActivity: f.physicalActivity,
    dietQuality: f.dietQuality,
    sleepHours: f.sleepHours,
    drinksAlcohol: f.drinksAlcohol,
  };
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

const RISK_COLORS = {
  low: { bg: "bg-[var(--success-bg)]", border: "border-[var(--success-border)]", text: "text-[var(--success)]", label: "Low Risk", bar: "bg-[var(--success)]" },
  moderate: { bg: "bg-[var(--warning-bg)]", border: "border-amber-200", text: "text-amber-700", label: "Moderate Risk", bar: "bg-amber-500" },
  high: { bg: "bg-[var(--danger-bg)]", border: "border-red-200", text: "text-[var(--danger)]", label: "High Risk", bar: "bg-[var(--danger)]" },
};

function RiskCard({
  title,
  value,
  unit,
  level,
  description,
  barPercent,
}: {
  title: string;
  value: string | number;
  unit?: string;
  level: "low" | "moderate" | "high";
  description: string;
  barPercent?: number | null;
}) {
  const style = RISK_COLORS[level];
  const pct = barPercent != null ? Math.min(100, Math.max(0, barPercent)) : null;
  return (
    <div className={cn("rounded-2xl border p-5", style.bg, style.border)}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-sm text-[var(--foreground)]">{title}</h3>
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", style.bg, style.text, "border", style.border)}>
          {style.label}
        </span>
      </div>
      <div className="flex items-end gap-2 mb-3">
        <span
          className={cn(
            typeof value === "string" && value.length > 14 ? "text-lg font-bold leading-snug" : "text-3xl font-extrabold",
            style.text
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-sm text-[var(--muted-foreground)] mb-1">{unit}</span>
        ) : null}
      </div>
      {pct !== null ? (
        <div className="mb-3 h-2 w-full rounded-full bg-white/60">
          <div className={cn("h-2 rounded-full transition-all", style.bar)} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
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
  useImperial: true,
  dietQuality: "fair",
  physicalActivity: "moderate",
  sleepHours: 7,
  isSmoker: false,
  drinksAlcohol: false,
  dailyActivity30Min: true,
  vegetablesOrFruitDaily: true,
  hasDiabetes: false,
  hasHypertension: false,
  hasCVD: false,
  systolicBP: 125,
  diastolicBP: 78,
  fastingGlucose: Math.round((100 / 18) * 100) / 100,
  hba1cPercent: null,
  triglyceridesMgdl: null,
  lpaMgdl: null,
  takesBpMedication: false,
  priorHighGlucoseEver: false,
  hadGestationalDiabetes: false,
  totalCholesterolMgdl: 195,
  hdlCholesterolMgdl: 52,
};

const TOTAL_STEPS = 4;

const W_KG_MIN = 20;
const W_KG_MAX = 300;
const H_CM_MIN = 100;
const H_CM_MAX = 250;
const W_CM_MIN = 50;
const W_CM_MAX = 200;

function kgToLbs(kg: number) {
  return Math.round(kg * 2.20462 * 10) / 10;
}
function lbsToKg(lbs: number) {
  return Math.round(lbs * 0.453592 * 10) / 10;
}
function cmToIn(cm: number) {
  return Math.round((cm / 2.54) * 10) / 10;
}
function inToCm(inch: number) {
  return Math.round(inch * 2.54 * 10) / 10;
}

/** Synchronously merge in-progress text fields with stored values (all math in cm / kg). */
function mergeBodyDrafts(
  f: AssessForm,
  weightT: string | null,
  heightT: string | null,
  waistT: string | null
): { form: AssessForm; ok: boolean; bad: "w" | "h" | "a" | null } {
  const out = { ...f };

  if (weightT !== null) {
    const raw = weightT.trim();
    if (raw === "" || raw === ".") {
      /* keep out.weightKg */
    } else {
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        return { form: f, ok: false, bad: "w" };
      }
      if (f.useImperial) {
        const kg = lbsToKg(n);
        if (kg < W_KG_MIN || kg > W_KG_MAX) {
          return { form: f, ok: false, bad: "w" };
        }
        out.weightKg = kg;
      } else {
        if (n < W_KG_MIN || n > W_KG_MAX) {
          return { form: f, ok: false, bad: "w" };
        }
        out.weightKg = n;
      }
    }
  }

  if (heightT !== null) {
    const raw = heightT.trim();
    if (raw === "" || raw === ".") {
      /* keep */
    } else {
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        return { form: f, ok: false, bad: "h" };
      }
      if (f.useImperial) {
        const cm = inToCm(n);
        if (cm < H_CM_MIN || cm > H_CM_MAX) {
          return { form: f, ok: false, bad: "h" };
        }
        out.heightCm = cm;
      } else {
        if (n < H_CM_MIN || n > H_CM_MAX) {
          return { form: f, ok: false, bad: "h" };
        }
        out.heightCm = n;
      }
    }
  }

  if (waistT !== null) {
    const raw = waistT.trim();
    if (raw === "" || raw === ".") {
      /* keep */
    } else {
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        return { form: f, ok: false, bad: "a" };
      }
      if (f.useImperial) {
        const cm = inToCm(n);
        if (cm < W_CM_MIN || cm > W_CM_MAX) {
          return { form: f, ok: false, bad: "a" };
        }
        out.waistCm = cm;
      } else {
        if (n < W_CM_MIN || n > W_CM_MAX) {
          return { form: f, ok: false, bad: "a" };
        }
        out.waistCm = n;
      }
    }
  }

  if (!Number.isFinite(out.weightKg) || out.weightKg < W_KG_MIN || out.weightKg > W_KG_MAX) {
    return { form: f, ok: false, bad: "w" };
  }
  if (
    !Number.isFinite(out.heightCm) ||
    out.heightCm < H_CM_MIN ||
    out.heightCm > H_CM_MAX
  ) {
    return { form: f, ok: false, bad: "h" };
  }
  if (!Number.isFinite(out.waistCm) || out.waistCm < W_CM_MIN || out.waistCm > W_CM_MAX) {
    return { form: f, ok: false, bad: "a" };
  }

  return { form: out, ok: true, bad: null };
}

export function AssessmentApp() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AssessForm>(defaultForm);
  const [result, setResult] = useState<RiskResult | null>(null);
  /** In-progress number fields (string) so the user can clear the box and re-type. */
  const [weightText, setWeightText] = useState<string | null>(null);
  const [heightText, setHeightText] = useState<string | null>(null);
  const [waistText, setWaistText] = useState<string | null>(null);
  const [bodyStepError, setBodyStepError] = useState<string | null>(null);

  const update = (patch: Partial<AssessForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    setWeightText(null);
    setHeightText(null);
    setWaistText(null);
  }, [form.useImperial]);

  const applyBlurField = (field: "w" | "h" | "a") => {
    if (field === "w" && weightText === null) return;
    if (field === "h" && heightText === null) return;
    if (field === "a" && waistText === null) return;
    const m = mergeBodyDrafts(
      form,
      field === "w" ? weightText : null,
      field === "h" ? heightText : null,
      field === "a" ? waistText : null
    );
    if (m.ok) setForm(m.form);
    if (field === "w") setWeightText(null);
    if (field === "h") setHeightText(null);
    if (field === "a") setWaistText(null);
  };

  const handleFinish = () => {
    setBodyStepError(null);
    const m = mergeBodyDrafts(form, weightText, heightText, waistText);
    if (!m.ok) {
      const part =
        m.bad === "w" ? "weight" : m.bad === "h" ? "height" : m.bad === "a" ? "waist" : "measurements";
      setBodyStepError(
        `Please check ${part} before finishing. Ranges: ` +
          (form.useImperial
            ? "66–660 lb, 48–96 in tall, 20–80 in waist."
            : "20–300 kg, 100–250 cm tall, 50–200 cm waist.")
      );
      return;
    }
    setResult(computeFullAssessment(formToAssessmentSnapshot(m.form)));
    setStep(TOTAL_STEPS);
  };

  const goNext = () => {
    setBodyStepError(null);
    if (step === 1) {
      const m = mergeBodyDrafts(form, weightText, heightText, waistText);
      if (!m.ok) {
        const part =
          m.bad === "w" ? "weight" : m.bad === "h" ? "height" : m.bad === "a" ? "waist" : "a measurement in";
        setBodyStepError(
          `Please check ${part}. You can clear a field and type a new value. Ranges: ` +
            (form.useImperial
              ? "66–660 lb, 48–96 in tall, 20–80 in waist."
              : "20–300 kg, 100–250 cm tall, 50–200 cm waist.")
        );
        return;
      }
      setForm(m.form);
      setWeightText(null);
      setHeightText(null);
      setWaistText(null);
    }
    setStep((s) => s + 1);
  };

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
        <h1 className="font-display text-2xl tracking-tight text-[var(--foreground)] mb-2 md:text-3xl">South Asian Risk Assessment</h1>
        <div className="space-y-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          <p>
            Estimate diabetes and cardiovascular risk using standard clinical models plus South Asian-specific interpretation layers.
          </p>
          <p className="text-[var(--foreground)]/90">
            Educational only — not a diagnosis. Discuss results with a licensed clinician.
          </p>
        </div>
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
                <button type="button" onClick={() => update({ useImperial: true })} className={cn("px-2 py-1 rounded-md font-medium transition-all", form.useImperial ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}>
                  US
                </button>
                <button type="button" onClick={() => update({ useImperial: false })} className={cn("px-2 py-1 rounded-md font-medium transition-all", !form.useImperial ? "bg-white text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]")}>
                  Metric
                </button>
              </div>
            </div>

            {bodyStepError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
                {bodyStepError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{form.useImperial ? "Weight (lbs)" : "Weight (kg)"}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={
                    weightText !== null
                      ? weightText
                      : String(form.useImperial ? kgToLbs(form.weightKg) : form.weightKg)
                  }
                  onChange={(e) => setWeightText(e.target.value)}
                  onBlur={() => applyBlurField("w")}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{form.useImperial ? "Height (inches, total)" : "Height (cm)"}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={
                    heightText !== null
                      ? heightText
                      : String(form.useImperial ? cmToIn(form.heightCm) : form.heightCm)
                  }
                  onChange={(e) => setHeightText(e.target.value)}
                  onBlur={() => applyBlurField("h")}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Live BMI preview */}
            {(() => {
              const m = mergeBodyDrafts(form, weightText, heightText, waistText);
              if (!m.ok) {
                return (
                  <div className="flex items-center gap-3 bg-[var(--muted)] rounded-xl px-4 py-3">
                    <span className="text-xs text-[var(--muted-foreground)]">Your BMI (South Asian scale):</span>
                    <span className="font-bold text-sm text-[var(--muted-foreground)]">…</span>
                  </div>
                );
              }
              const bmi = m.form.weightKg / Math.pow(m.form.heightCm / 100, 2);
              if (!Number.isFinite(bmi)) {
                return null;
              }
              const cat =
                bmi < 16
                  ? "Severe underweight"
                : bmi < 18.5
                  ? "Underweight"
                : bmi < 23
                  ? "Normal"
                : bmi < 27.5
                  ? "Overweight"
                : "Obese";
              const color =
                bmi < 16
                  ? "text-red-600"
                : bmi < 18.5
                  ? "text-amber-600"
                : bmi < 23
                  ? "text-[var(--success)]"
                : bmi < 27.5
                  ? "text-amber-600"
                : "text-[var(--danger)]";
              return (
                <div className="flex flex-col gap-0.5 bg-[var(--muted)] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[var(--muted-foreground)]">Your BMI (South Asian scale):</span>
                    <span className={cn("font-bold text-sm", color)}>
                      {bmi.toFixed(1)} — {cat}
                    </span>
                  </div>
                  {bmi < 18.5 && (
                    <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                      Low body weight is an important health signal too, not just high BMI.
                    </p>
                  )}
                </div>
              );
            })()}

            <div>
              <label className={labelCls}>{form.useImperial ? "Waist circumference (inches)" : "Waist circumference (cm)"}</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-2">
                {form.useImperial
                  ? "Measure at the navel level. South Asian thresholds: ≥35.4 in (men) / ≥31.5 in (women)."
                  : "Measure at the navel level. South Asian thresholds: ≥90 cm (men) / ≥80 cm (women)."}
              </p>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={waistText !== null ? waistText : String(form.useImperial ? cmToIn(form.waistCm) : form.waistCm)}
                onChange={(e) => setWaistText(e.target.value)}
                onBlur={() => applyBlurField("a")}
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

            <div className="border border-[var(--card-border)] rounded-xl px-4 divide-y divide-[var(--card-border)]">
              <CheckRow
                label="On most days I get at least 30 minutes of physical activity"
                checked={form.dailyActivity30Min}
                onChange={(v) => update({ dailyActivity30Min: v })}
                desc="FINDRISC question — counts toward diabetes score"
              />
              <CheckRow
                label="I eat vegetables or fruit every day"
                checked={form.vegetablesOrFruitDaily}
                onChange={(v) => update({ vegetablesOrFruitDaily: v })}
                desc="FINDRISC question — independent of diet quality buttons below"
              />
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
              <CheckRow
                label="I take prescribed medication for high blood pressure regularly"
                checked={form.takesBpMedication}
                onChange={(v) => update({ takesBpMedication: v })}
                desc="Used by FINDRISC and ASCVD blood-pressure treatment flag"
              />
              <CheckRow
                label="A clinician has told me I had high blood sugar, prediabetes, or gestational diabetes"
                checked={form.priorHighGlucoseEver}
                onChange={(v) => update({ priorHighGlucoseEver: v })}
              />
              <CheckRow
                label="History of gestational diabetes (if applicable)"
                checked={form.hadGestationalDiabetes}
                onChange={(v) => update({ hadGestationalDiabetes: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Blood pressure — systolic</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">Top number</p>
                <div className="relative">
                  <input type="number" min={70} max={250} value={form.systolicBP} onChange={(e) => update({ systolicBP: parseInt(e.target.value) || 120 })} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmHg</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Blood pressure — diastolic</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">Bottom number — needed for ACC/AHA staging</p>
                <div className="relative">
                  <input type="number" min={40} max={150} value={form.diastolicBP} onChange={(e) => update({ diastolicBP: parseInt(e.target.value) || 78 })} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmHg</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Total cholesterol</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">mg/dL — for ASCVD pooled cohort equations</p>
                <div className="relative">
                  <input
                    type="number"
                    min={100}
                    max={400}
                    step={1}
                    value={form.totalCholesterolMgdl}
                    onChange={(e) => update({ totalCholesterolMgdl: parseInt(e.target.value, 10) || 170 })}
                    className={inputCls}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mg/dL</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>HDL cholesterol</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">mg/dL — high-density lipoprotein</p>
                <div className="relative">
                  <input
                    type="number"
                    min={20}
                    max={120}
                    step={1}
                    value={form.hdlCholesterolMgdl}
                    onChange={(e) => update({ hdlCholesterolMgdl: parseInt(e.target.value, 10) || 45 })}
                    className={inputCls}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mg/dL</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  {form.useImperial ? "Fasting blood glucose (mg/dL)" : "Fasting blood glucose (mmol/L)"}
                </label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">
                  {form.useImperial
                    ? "If unsure, enter 90 (normal is under about 100)."
                    : "If unsure, enter 5.0 (normal is under 5.6)."}
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min={form.useImperial ? 36 : 2}
                    max={form.useImperial ? 540 : 30}
                    step={form.useImperial ? 1 : 0.1}
                    value={form.useImperial ? mmolToMgdl(form.fastingGlucose) : form.fastingGlucose}
                    onChange={(e) =>
                      update({
                        fastingGlucose: form.useImperial
                          ? mgdlToMmol(parseFloat(e.target.value) || 90)
                          : parseFloat(e.target.value) || 5.0,
                      })
                    }
                    className={inputCls}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">
                    {form.useImperial ? "mg/dL" : "mmol/L"}
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>HbA1c (optional)</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">%</p>
                <input
                  type="number"
                  min={3}
                  max={15}
                  step={0.1}
                  value={form.hba1cPercent ?? ""}
                  onChange={(e) =>
                    update({
                      hba1cPercent:
                        e.target.value.trim() === "" ? null : parseFloat(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Triglycerides (optional)</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">mg/dL</p>
                <input
                  type="number"
                  min={30}
                  max={1000}
                  step={1}
                  value={form.triglyceridesMgdl ?? ""}
                  onChange={(e) =>
                    update({
                      triglyceridesMgdl:
                        e.target.value.trim() === "" ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Lp(a) (optional)</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-1.5">mg/dL</p>
                <input
                  type="number"
                  min={0}
                  max={300}
                  step={1}
                  value={form.lpaMgdl ?? ""}
                  onChange={(e) =>
                    update({
                      lpaMgdl: e.target.value.trim() === "" ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === TOTAL_STEPS && result && (
          <div className="space-y-6">
            <div>
              <h2 className="font-bold text-lg text-[var(--foreground)] mb-1">Overall cardiometabolic concern</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Diabetes risk is estimated using an IDRS-style South Asian screening framework, with additional educational modifiers for BMI, waist-to-height ratio, and optional labs. Cardiovascular risk uses standard U.S. ASCVD equations, with a separate South Asian risk-enhancer interpretation layer.
              </p>
            </div>

            <div className={cn("rounded-xl border p-4", RISK_COLORS[result.overallConcernLevel].bg, RISK_COLORS[result.overallConcernLevel].border)}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-[var(--foreground)]">Overall cardiometabolic concern</p>
                <span className={cn("text-xs font-bold", RISK_COLORS[result.overallConcernLevel].text)}>{RISK_COLORS[result.overallConcernLevel].label}</span>
              </div>
            </div>

            <h3 className="font-semibold text-[var(--foreground)]">A. Diabetes</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RiskCard
                title="IDRS+ South Asian Diabetes Risk"
                value={result.idrsEducationalPercent}
                unit="% educational estimate (~8y)"
                level={result.diabetesOverallConcern}
                description={`IDRS base ${result.idrsBaseScore}/100 (${result.idrsBaseRiskLevel}) + modifier burden ${result.diabetesModifierBurdenCount} (${result.diabetesModifierBurdenLevel}). South Asian-adjusted educational screening profile; not clinically validated for U.S. South Asians.`}
                barPercent={result.idrsEducationalPercent}
              />
              {result.findriscScore !== null && result.findriscTenYearDiabetesPercent !== null ? (
                <RiskCard
                  title="General-population diabetes score (FINDRISC comparison)"
                  value={result.findriscTenYearDiabetesPercent}
                  unit="% est."
                  level={result.bmiRisk}
                  description={`Optional comparison only. FINDRISC ${result.findriscScore}/26.`}
                  barPercent={result.findriscTenYearDiabetesPercent}
                />
              ) : (
                <div className="rounded-xl border border-[var(--card-border)] p-4 text-sm text-[var(--muted-foreground)]">FINDRISC comparison not shown (diabetes already diagnosed).</div>
              )}
            </div>

            <h3 className="font-semibold text-[var(--foreground)]">B. Cardiovascular</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.ascvdTenYearPercent !== null && result.ascvdRiskLevel !== null ? (
                <RiskCard
                  title="Base 10-year ASCVD risk"
                  value={result.ascvdTenYearPercent}
                  unit="%"
                  level={result.ascvdRiskLevel}
                  description="Standard model badge: ACC/AHA Pooled Cohort Equation (not South Asian-validated)."
                  barPercent={result.ascvdTenYearPercent}
                />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-[var(--warning-bg)] p-5">
                  <h3 className="mb-2 font-semibold text-sm text-[var(--foreground)]">Base 10-year ASCVD risk</h3>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{result.ascvdUnavailableReason}</p>
                </div>
              )}
              <RiskCard
                title="South Asian ASCVD Risk Enhancer Layer"
                value={`${result.ascvdEnhancerBurdenLabel} burden`}
                level={result.ascvdEnhancerBurdenLabel === "high" ? "high" : result.ascvdEnhancerBurdenLabel === "moderate" ? "moderate" : "low"}
                description={`${result.ascvdEnhancerInterpretation}${result.exploratoryAdjustedRange ? ` Exploratory adjusted range: ${result.exploratoryAdjustedRange}. This range is exploratory and not clinically validated.` : ""}`}
                barPercent={null}
              />
            </div>

            <h3 className="font-semibold text-[var(--foreground)]">C. Blood pressure</h3>
            <RiskCard
              title="Blood Pressure Category"
              value={result.bpCategoryLabel}
              level={result.bpCategorySeverity}
              description="ACC/AHA 2017 categories."
              barPercent={null}
            />

            <h3 className="font-semibold text-[var(--foreground)]">D. Body composition / central adiposity</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RiskCard title="BMI (South Asian threshold)" value={result.bmi} unit="kg/m²" level={result.bmiRisk} description={result.bmiCategory} barPercent={null} />
              <RiskCard title="Waist-to-height ratio" value={result.waistToHeightRatio} level={result.waistToHeightRatio >= 0.5 ? "high" : "low"} description={result.waistToHeightCategory} barPercent={null} />
            </div>

            {result.idrsBreakdown && result.idrsBreakdown.length > 0 ? (
              <details className="rounded-xl border border-[var(--card-border)] bg-[var(--muted)] px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-[var(--foreground)]">Methodology</summary>
                <ul className="mt-3 space-y-1.5 text-[var(--muted-foreground)]">
                  {result.idrsBreakdown.map((row) => (
                    <li key={row.id} className="flex justify-between gap-4">
                      <span>{row.label}</span>
                      <span className="font-mono text-[var(--foreground)]">+{row.points}</span>
                    </li>
                  ))}
                  <li>Standard model: ACC/AHA PCE for base ASCVD risk.</li>
                  <li>South Asian thresholds and enhancers modify interpretation, not diagnosis.</li>
                  <li>No fixed ASCVD multiplier is clinically accepted.</li>
                  <li>Future versions may incorporate MASALA-calibrated adjustment if validated outcome-based analysis becomes available.</li>
                </ul>
              </details>
            ) : null}

            <h3 className="font-semibold text-[var(--foreground)]">E. Recommendations</h3>
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
              <button
                type="button"
                onClick={() => {
                  if (result) {
                    storeRiskScreenerForChat(result);
                    router.push("/chat?from=assess");
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold text-center hover:bg-[var(--primary-hover)] transition-colors"
              >
                Ask questions about your results →
              </button>
              <Link href="/simulate" className="flex-1 py-3 rounded-xl border border-[var(--card-border)] bg-white text-sm font-semibold text-center text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                Run a physiology simulation →
              </Link>
            </div>

            <button
              onClick={() => {
                setStep(0);
                setResult(null);
                setBodyStepError(null);
                setWeightText(null);
                setHeightText(null);
                setWaistText(null);
                setForm(defaultForm);
              }}
              className="w-full text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] py-1 transition-colors"
            >
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
