"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SimulationResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SimulationChartProps {
  result: SimulationResult;
  metricLabels: Record<string, string>;
  metricColors: string[];
}

const REFERENCE_LINES: Record<
  string,
  { value: number; label: string; color: string }[]
> = {
  systolic_bp: [
    { value: 130, label: "High blood pressure level", color: "#ef4444" },
  ],
  diastolic_bp: [
    { value: 80, label: "High blood pressure level", color: "#ef4444" },
  ],
  fasting_glucose_mmol: [
    { value: 5.6, label: "Pre-diabetes level", color: "#f59e0b" },
    { value: 7.0, label: "Diabetes level", color: "#ef4444" },
  ],
  hba1c_percent: [
    { value: 6.5, label: "Diabetes level", color: "#ef4444" },
    { value: 7.0, label: "Recommended target", color: "#3b82f6" },
  ],
  bmi: [
    { value: 23.0, label: "Overweight (South Asian scale)", color: "#f59e0b" },
    { value: 27.5, label: "Obese (South Asian scale)", color: "#ef4444" },
  ],
};

function RiskBadge({ riskPercent }: { riskPercent: number }) {
  const isHigh = riskPercent >= 20;
  const isMod = riskPercent >= 10;
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-semibold",
        isHigh
          ? "bg-red-100 text-red-700"
          : isMod
          ? "bg-amber-100 text-amber-700"
          : "bg-green-100 text-green-700"
      )}
    >
      {isHigh ? "High" : isMod ? "Moderate" : "Low"}
    </span>
  );
}

export function SimulationChart({
  result,
  metricLabels,
  metricColors,
}: SimulationChartProps) {
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(
    new Set(result.metrics)
  );

  const toggleMetric = (metric: string) => {
    setVisibleMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) {
        if (next.size > 1) next.delete(metric);
      } else {
        next.add(metric);
      }
      return next;
    });
  };

  const activeMetrics = result.metrics.filter((m) => visibleMetrics.has(m));
  const cvdRisk = result.patient_summary.cvd_risk_10yr_percent;

  return (
    <div className="space-y-4">
      {/* Patient summary card */}
      <div className="bg-white border border-[var(--card-border)] rounded-2xl p-4">
        <h3 className="font-semibold text-sm mb-3 text-[var(--foreground)]">
          Your Health Summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* BMI card */}
          <div
            className={cn(
              "rounded-xl p-3 text-center",
              result.patient_summary.bmi >= 23
                ? "bg-amber-50 border border-amber-200"
                : "bg-[var(--muted)]"
            )}
          >
            <p className="text-xs text-[var(--muted-foreground)]">
              Body Mass Index
            </p>
            <p className="font-bold text-sm mt-0.5 text-[var(--foreground)]">
              {result.patient_summary.bmi} kg/m²
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {result.patient_summary.bmi_category_south_asian}
            </p>
          </div>

          {/* Heart disease risk card */}
          <div
            className={cn(
              "rounded-xl p-3 text-center",
              cvdRisk >= 10
                ? "bg-amber-50 border border-amber-200"
                : "bg-[var(--muted)]"
            )}
          >
            <p className="text-xs text-[var(--muted-foreground)]">
              Heart Disease Risk
            </p>
            <p className="font-bold text-sm mt-0.5 text-[var(--foreground)]">
              {cvdRisk}%
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              over next 10 years
            </p>
          </div>

          {/* Age / sex card */}
          <div className="rounded-xl p-3 text-center bg-[var(--muted)]">
            <p className="text-xs text-[var(--muted-foreground)]">Age</p>
            <p className="font-bold text-sm mt-0.5 text-[var(--foreground)]">
              {result.patient_summary.age} yrs
            </p>
            <p className="text-xs text-[var(--muted-foreground)] capitalize">
              {result.patient_summary.sex}
            </p>
          </div>

          {/* Risk category card (replaces Engine card) */}
          <div
            className={cn(
              "rounded-xl p-3 text-center",
              cvdRisk >= 20
                ? "bg-red-50 border border-red-200"
                : cvdRisk >= 10
                ? "bg-amber-50 border border-amber-200"
                : "bg-green-50 border border-green-200"
            )}
          >
            <p className="text-xs text-[var(--muted-foreground)]">
              Risk Category
            </p>
            <div className="mt-1.5 flex justify-center">
              <RiskBadge riskPercent={cvdRisk} />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              heart disease risk
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border border-[var(--card-border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-[var(--foreground)]">
            {result.scenario_label}
          </h3>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {result.metrics.map((metric, i) => (
              <button
                key={metric}
                onClick={() => toggleMetric(metric)}
                className={cn(
                  "px-2 py-1 rounded-lg text-xs font-medium border transition-all",
                  visibleMetrics.has(metric)
                    ? "text-white border-transparent"
                    : "bg-white text-[var(--muted-foreground)] border-[var(--card-border)]"
                )}
                style={
                  visibleMetrics.has(metric)
                    ? {
                        backgroundColor:
                          metricColors[i % metricColors.length],
                      }
                    : {}
                }
              >
                {metricLabels[metric]?.split(" (")[0] ??
                  metricLabels[metric] ??
                  metric}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <LineChart
            data={result.data}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
            <XAxis
              dataKey={result.x_axis}
              label={{
                value: result.x_label,
                position: "insideBottom",
                offset: -3,
                style: { fontSize: 11, fill: "#78716c" },
              }}
              tick={{ fontSize: 11, fill: "#78716c" }}
            />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e7e5e4",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value, name) => [
                typeof value === "number"
                  ? value.toFixed(1)
                  : String(value ?? ""),
                metricLabels[String(name ?? "")] ?? String(name ?? ""),
              ]}
              labelFormatter={(label) => `${result.x_label}: ${label}`}
            />
            <Legend
              formatter={(value) =>
                metricLabels[value]?.split(" (")[0] ?? value
              }
              wrapperStyle={{ fontSize: 11 }}
            />
            {activeMetrics.map((metric, i) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={
                  metricColors[
                    result.metrics.indexOf(metric) % metricColors.length
                  ]
                }
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {/* Reference lines for the primary active metric */}
            {activeMetrics.slice(0, 1).map((metric) =>
              (REFERENCE_LINES[metric] ?? []).map((ref) => (
                <ReferenceLine
                  key={ref.label}
                  y={ref.value}
                  stroke={ref.color}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value: ref.label,
                    position: "insideTopRight",
                    style: { fontSize: 10, fill: ref.color },
                  }}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Clinical notes */}
      {result.clinical_notes && result.clinical_notes.length > 0 && (
        <div className="bg-white border border-[var(--card-border)] rounded-2xl p-5">
          <h3 className="font-semibold text-sm text-[var(--foreground)] mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-3.5 h-3.5 text-[var(--primary)]"
              >
                <path
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            What this means for you
          </h3>
          <div className="space-y-3">
            {result.clinical_notes.map((note, i) => {
              // Last note is always the disclaimer — style it differently
              const isDisclaimer = i === result.clinical_notes.length - 1;
              if (isDisclaimer) {
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 pt-3 border-t border-[var(--card-border)]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0 mt-0.5"
                    >
                      <path
                        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed italic">
                      {note}
                    </p>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl bg-[var(--accent)] border border-[var(--accent-border)] px-4 py-3"
                >
                  <span className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-[10px] font-bold">
                      {i + 1}
                    </span>
                  </span>
                  <p className="text-sm text-[var(--foreground)] leading-relaxed">
                    {note}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
