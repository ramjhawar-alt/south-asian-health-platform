"use client";

import { useState, useEffect } from "react";
import {
  fetchScenarios,
  runSimulation,
  type SimulationRequest,
  type SimulationResult,
  type ScenarioMeta,
} from "@/lib/api";
import { SimulationChart } from "@/components/simulation-chart";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<string, string> = {
  heart_rate: "Heart Rate (beats/min)",
  systolic_bp: "Systolic BP (mmHg)",
  diastolic_bp: "Diastolic BP (mmHg)",
  cardiac_output_L_min: "Cardiac Output (L/min)",
  bmi: "BMI (kg/m²)",
  fasting_glucose_mmol: "Fasting Glucose (mmol/L)",
  hba1c_percent: "HbA1c (%)",
  cvd_risk_10yr_percent: "10-Year CVD Risk (%)",
  estimated_cvd_risk_reduction_percent: "CVD Risk Reduction (%)",
  pulse_pressure: "Pulse Pressure (mmHg)",
  t2dm_5yr_risk_percent: "5-Year T2DM Risk (%)",
  recommended_hba1c_target: "HbA1c Target (%)",
};

const METRIC_COLORS = [
  "#3730a3",
  "#e07b0d",
  "#0d9488",
  "#dc2626",
  "#7c3aed",
  "#0284c7",
];

function InfoTip({ text }: { text: string }) {
  return (
    <span className="ml-1.5 relative inline-flex items-center group shrink-0">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] text-[10px] font-bold cursor-help border border-[var(--card-border)]">
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 rounded-xl bg-[var(--foreground)] text-white text-xs leading-relaxed px-3 py-2.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 font-normal">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-[var(--foreground)]" />
      </span>
    </span>
  );
}

function FormField({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--foreground)] flex items-center leading-tight">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
}: {
  value: number | string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
  tooltip,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tooltip?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-[var(--primary)]"
      />
      <span className="text-sm flex items-center text-[var(--foreground)]">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
    </label>
  );
}

const defaultForm: Omit<SimulationRequest, "scenario"> = {
  age: 42,
  sex: "male",
  weight_kg: 75,
  height_cm: 168,
  systolic_bp: 135,
  diastolic_bp: 85,
  heart_rate: 72,
  fasting_glucose_mmol: 5.9,
  hba1c: null,
  has_diabetes: false,
  has_hypertension: false,
  is_smoker: false,
  physical_activity: "moderate",
};

const kgToLbs = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;
const lbsToKg = (lbs: number) => Math.round(lbs * 0.453592 * 10) / 10;
const cmToFtIn = (cm: number) => {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches % 12) * 10) / 10;
  return { ft, inches };
};
const ftInToCm = (ft: number, inches: number) =>
  Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
const mmolToMgdl = (mmol: number) => Math.round(mmol * 18.0 * 10) / 10;
const mgdlToMmol = (mgdl: number) => Math.round((mgdl / 18.0) * 100) / 100;

export default function SimulatePage() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [form, setForm] = useState(defaultForm);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useImperial, setUseImperial] = useState(false);

  useEffect(() => {
    fetchScenarios()
      .then((s) => {
        setScenarios(s);
        if (s.length > 0) setSelectedScenario(s[0].id);
      })
      .catch(() => {
        const fallback: ScenarioMeta[] = [
          {
            id: "cardiovascular_stress",
            label: "How Your Heart Responds to Exercise",
            description: "See how your heart rate and blood pressure change during a 2-minute workout.",
            x_axis: "time_s",
            x_label: "Time (seconds)",
            metrics: ["heart_rate", "systolic_bp", "diastolic_bp"],
          },
          {
            id: "metabolic_syndrome",
            label: "My Health Over the Next 10 Years",
            description: "See how weight, blood sugar, and heart disease risk may evolve if current habits continue.",
            x_axis: "year",
            x_label: "Year",
            metrics: ["bmi", "fasting_glucose_mmol", "hba1c_percent", "cvd_risk_10yr_percent"],
          },
          {
            id: "hypertension_treatment",
            label: "Blood Pressure Treatment Progress",
            description: "See how blood pressure medication could lower your readings over 12 weeks.",
            x_axis: "week",
            x_label: "Week",
            metrics: ["systolic_bp", "diastolic_bp"],
          },
          {
            id: "diabetes_progression",
            label: "Diabetes Risk Over Time",
            description: "Track how blood sugar and diabetes risk may change over the next 5 years.",
            x_axis: "year",
            x_label: "Year",
            metrics: ["fasting_glucose_mmol", "hba1c_percent", "t2dm_5yr_risk_percent"],
          },
        ];
        setScenarios(fallback);
        setSelectedScenario(fallback[0].id);
      });
  }, []);

  const handleRun = async () => {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runSimulation({ ...form, scenario: selectedScenario });
      setResult(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Simulation failed. Please ensure the backend server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const bmi = form.weight_kg / Math.pow(form.height_cm / 100, 2);
  const bmiCategory =
    bmi < 18.5 ? "Underweight"
    : bmi < 23 ? "Normal weight"
    : bmi < 27.5 ? "Overweight (South Asian scale)"
    : "Obese (South Asian scale)";

  const { ft: displayFt, inches: displayIn } = cmToFtIn(form.height_cm);
  const displayLbs = kgToLbs(form.weight_kg);
  const displayMgdl = mmolToMgdl(form.fasting_glucose_mmol);

  return (
    /* Full viewport split: left panel + right panel, no page scroll */
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── LEFT PANEL — form (sticky, scrolls internally) ── */}
      <div className="w-[360px] flex-shrink-0 flex flex-col border-r border-[var(--card-border)] bg-white overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Header */}
          <div>
            <h1 className="text-lg font-bold text-[var(--foreground)]">Physiology Simulator</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
              Enter your profile and run a scenario — results appear on the right in real time.
            </p>
          </div>

          {/* Scenario selector */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2">
              Scenario
            </p>
            <div className="space-y-1.5">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScenario(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all",
                    selectedScenario === s.id
                      ? "border-[var(--primary)] bg-[var(--sidebar-active)] text-[var(--primary)]"
                      : "border-[var(--card-border)] bg-[var(--muted)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/40 hover:bg-[var(--accent)]"
                  )}
                >
                  <p className="font-semibold leading-snug">{s.label}</p>
                  <p className="text-xs mt-0.5 opacity-75">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Profile section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                Your Profile
              </p>
              {/* Unit toggle */}
              <div className="flex items-center gap-0.5 bg-[var(--muted)] rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setUseImperial(false)}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all",
                    !useImperial
                      ? "bg-white text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)]"
                  )}
                >
                  Metric
                </button>
                <button
                  onClick={() => setUseImperial(true)}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all",
                    useImperial
                      ? "bg-white text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted-foreground)]"
                  )}
                >
                  US
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Age (years)">
                  <NumberInput value={form.age} onChange={(v) => setForm((f) => ({ ...f, age: v }))} min={18} max={100} />
                </FormField>
                <FormField label="Sex">
                  <SelectInput
                    value={form.sex}
                    onChange={(v) => setForm((f) => ({ ...f, sex: v }))}
                    options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label={useImperial ? "Weight (lbs)" : "Weight (kg)"}>
                  <NumberInput
                    value={useImperial ? displayLbs : form.weight_kg}
                    onChange={(v) => setForm((f) => ({ ...f, weight_kg: useImperial ? lbsToKg(v) : v }))}
                    min={useImperial ? 66 : 30}
                    max={useImperial ? 660 : 300}
                    step={0.1}
                  />
                </FormField>

                {useImperial ? (
                  <FormField label="Height (ft / in)" hint={`BMI: ${bmi.toFixed(1)} — ${bmiCategory}`}>
                    <div className="flex gap-1.5">
                      <NumberInput
                        value={displayFt}
                        onChange={(v) => setForm((f) => ({ ...f, height_cm: ftInToCm(v, displayIn) }))}
                        min={3} max={8} step={1} placeholder="ft"
                      />
                      <NumberInput
                        value={displayIn}
                        onChange={(v) => setForm((f) => ({ ...f, height_cm: ftInToCm(displayFt, v) }))}
                        min={0} max={11} step={0.5} placeholder="in"
                      />
                    </div>
                  </FormField>
                ) : (
                  <FormField label="Height (cm)" hint={`BMI: ${bmi.toFixed(1)} — ${bmiCategory}`}>
                    <NumberInput
                      value={form.height_cm}
                      onChange={(v) => setForm((f) => ({ ...f, height_cm: v }))}
                      min={100} max={250} step={0.5}
                    />
                  </FormField>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Systolic BP"
                  tooltip="The 'top number' — pressure when your heart beats and pumps blood. Normal is below 120 mmHg."
                >
                  <div className="relative">
                    <NumberInput value={form.systolic_bp} onChange={(v) => setForm((f) => ({ ...f, systolic_bp: v }))} min={70} max={250} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmHg</span>
                  </div>
                </FormField>
                <FormField
                  label="Diastolic BP"
                  tooltip="The 'bottom number' — pressure between heartbeats when the heart rests. Normal is below 80 mmHg."
                >
                  <div className="relative">
                    <NumberInput value={form.diastolic_bp} onChange={(v) => setForm((f) => ({ ...f, diastolic_bp: v }))} min={40} max={150} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">mmHg</span>
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Resting Heart Rate"
                  tooltip="How many times your heart beats per minute at rest. Normal for adults is 60–100 bpm."
                >
                  <div className="relative">
                    <NumberInput value={form.heart_rate} onChange={(v) => setForm((f) => ({ ...f, heart_rate: v }))} min={40} max={200} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] pointer-events-none">bpm</span>
                  </div>
                </FormField>
                <FormField
                  label={useImperial ? "Blood Sugar (mg/dL)" : "Blood Sugar (mmol/L)"}
                  tooltip="Fasting blood glucose — your blood sugar level after not eating for 8+ hours. Normal is below 5.6 mmol/L (100 mg/dL)."
                >
                  <NumberInput
                    value={useImperial ? displayMgdl : form.fasting_glucose_mmol}
                    onChange={(v) => setForm((f) => ({ ...f, fasting_glucose_mmol: useImperial ? mgdlToMmol(v) : v }))}
                    min={useImperial ? 36 : 2}
                    max={useImperial ? 540 : 30}
                    step={useImperial ? 1 : 0.1}
                  />
                </FormField>
              </div>

              {form.has_diabetes && (
                <FormField
                  label="HbA1c (optional)"
                  tooltip="Your 3-month average blood sugar — a standard diabetes test. Ask your doctor if you have this result."
                >
                  <NumberInput
                    value={form.hba1c ?? ""}
                    onChange={(v) => setForm((f) => ({ ...f, hba1c: isNaN(v) ? null : v }))}
                    min={3} max={15} step={0.1} placeholder="e.g. 7.2"
                  />
                </FormField>
              )}

              <FormField label="Activity Level">
                <SelectInput
                  value={form.physical_activity}
                  onChange={(v) => setForm((f) => ({ ...f, physical_activity: v }))}
                  options={[
                    { value: "sedentary", label: "Sedentary (little or no exercise)" },
                    { value: "moderate", label: "Moderate (exercise a few times/week)" },
                    { value: "active", label: "Active (exercise most days)" },
                  ]}
                />
              </FormField>

              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--card-border)]">
                <p className="text-xs text-[var(--muted-foreground)]">Check any that apply:</p>
                <CheckboxField label="I have Type 2 Diabetes" checked={form.has_diabetes} onChange={(v) => setForm((f) => ({ ...f, has_diabetes: v, hba1c: v ? f.hba1c : null }))} />
                <CheckboxField label="I have Hypertension (High Blood Pressure)" checked={form.has_hypertension} onChange={(v) => setForm((f) => ({ ...f, has_hypertension: v }))} />
                <CheckboxField label="I smoke" checked={form.is_smoker} onChange={(v) => setForm((f) => ({ ...f, is_smoker: v }))} />
              </div>
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={loading || !selectedScenario}
            className={cn(
              "w-full py-3 rounded-xl font-semibold text-sm transition-all",
              loading || !selectedScenario
                ? "bg-[var(--card-border)] text-[var(--muted-foreground)] cursor-not-allowed"
                : "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-sm"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running simulation…
              </span>
            ) : (
              "Show My Results →"
            )}
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL — results (sticky, scrolls internally) ── */}
      <div className="flex-1 overflow-y-auto bg-[var(--background)]">
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm mb-4">
              {error}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center">
              <div className="w-20 h-20 rounded-2xl bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] flex items-center justify-center mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-[var(--primary)]">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-[var(--foreground)]">Your results will appear here</p>
              <p className="text-sm text-[var(--muted-foreground)] mt-2 max-w-sm leading-relaxed">
                Choose a scenario on the left, fill in your profile, and click
                &ldquo;Show My Results&rdquo; to see your personalized simulation.
              </p>
            </div>
          )}

          {result && (
            <SimulationChart
              result={result}
              metricLabels={METRIC_LABELS}
              metricColors={METRIC_COLORS}
            />
          )}
        </div>
      </div>
    </div>
  );
}
