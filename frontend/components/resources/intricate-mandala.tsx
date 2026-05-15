/**
 * Vector dharma wheel — 12-fold symmetry, path-based filigree only (no concentric ring “frames”).
 */
const C = 100;

function star12Path(outer: number, inner: number) {
  const n = 12;
  const parts: string[] = [];
  for (let k = 0; k < 2 * n; k++) {
    const ang = (k * Math.PI) / n - Math.PI / 2;
    const rad = k % 2 === 0 ? outer : inner;
    const x = C + rad * Math.cos(ang);
    const y = C + rad * Math.sin(ang);
    parts.push(k === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${parts.join(" ")} Z`;
}

type IntricateMandalaProps = {
  className?: string;
  "aria-hidden"?: boolean;
};

export function IntricateMandala({ className, ...rest }: IntricateMandalaProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" role="img" {...rest}>
      <title>Ornate dharma wheel pattern</title>
      <defs>
        <filter id="mandala-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 12-point stars — recede on scroll; wireframe globe reads as the hero */}
      <g
        className="mandala-star-ledger"
        style={{ opacity: "max(0.1, calc(1 - var(--mandala-t, 0) * 0.68))" }}
        filter="url(#mandala-glow)"
      >
        <path d={star12Path(91, 79)} className="stroke-indigo-100/90" strokeWidth={0.68} />
        <path d={star12Path(88, 77)} className="stroke-violet-200/30" strokeWidth={0.28} />
        <path d={star12Path(86, 75.5)} className="stroke-slate-200/25" strokeWidth={0.22} />
        <path d={star12Path(84, 73)} className="stroke-indigo-400/25" strokeWidth={0.2} />
        <path d={star12Path(80, 69)} className="stroke-indigo-300/20" strokeWidth={0.16} />
      </g>

      {/* (Gold / violet / amber radii removed — handoff is WebGL + cyan neural only.) */}

      {/* Open center so the 3D wireframe globe stays visible (no filled dot / ring on top of it) */}
    </svg>
  );
}
