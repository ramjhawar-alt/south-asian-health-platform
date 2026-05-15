import type { ReactNode } from "react";

/**
 * Open graph only: radials + light ring segments — no closed curved “lens / eye” paths.
 * Hands off to the next page as straight wireframe language, not an iris shape.
 */
const CX = 200;
const CY = 200;

const RADII = { outer: 178, mid: 92 };

/** Lock SVG nums so Node SSR and browser agree (float trig can differ across engines). */
function svgN(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function NeuralScrim() {
  const radials = Array.from({ length: 20 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 20 - Math.PI / 2;
    return (
      <line
        key={`r-${i}`}
        x1={CX}
        y1={CY}
        x2={svgN(CX + RADII.outer * Math.cos(a))}
        y2={svgN(CY + RADII.outer * Math.sin(a))}
        stroke="url(#neuralLine)"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  });

  const ringSegs: ReactNode[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i * 2 * Math.PI) / n - Math.PI / 2;
    const a1 = ((i + 1) * 2 * Math.PI) / n - Math.PI / 2;
    for (const r of [RADII.mid, 138] as const) {
      const key = `seg-${r}-${i}`;
      ringSegs.push(
        <line
          key={key}
          x1={svgN(CX + r * Math.cos(a0))}
          y1={svgN(CY + r * Math.sin(a0))}
          x2={svgN(CX + r * Math.cos(a1))}
          y2={svgN(CY + r * Math.sin(a1))}
          stroke="url(#neuralLine)"
          strokeWidth="0.55"
          strokeLinecap="round"
          opacity={0.42 + (i % 2) * 0.1}
        />
      );
    }
  }

  return (
    <>
      <style>{`
        @keyframes neuralScrimDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-0.5%, 0.4%) scale(1.008); }
        }
        @media (prefers-reduced-motion: reduce) {
          .neural-anim g { animation: none !important; }
        }
      `}</style>
      <svg
        className="neural-anim pointer-events-none absolute inset-0 h-full w-full [mix-blend-mode:plus-lighter] opacity-100 motion-reduce:opacity-30"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="neuralLine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.94" />
          </linearGradient>
        </defs>
        <g style={{ animation: "neuralScrimDrift 48s ease-in-out infinite" }}>
          {ringSegs}
          {radials}
        </g>
      </svg>
    </>
  );
}
