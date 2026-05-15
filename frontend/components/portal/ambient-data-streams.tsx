/**
 * Full-bleed ambient “data” — scrolling numbers, tokens, and sci-fi labels. Fills background without a busy diagram.
 */
const TOKENS = [
  "0.2841",
  "p<0.01",
  "AUC 0.81",
  "−2.14Δ",
  "BMI 24.2",
  "HDL 48",
  "SEQ 2048",
  "0x7f3a2",
  "λ=0.02",
  "σ² 1.24",
  "LOSS 0.04",
  "EMB 512d",
  "8 heads",
  "μ=5.2",
  "ρ 0.88",
  "R²=0.76",
  "attn 0.12",
  "logit",
  "∇L",
  "batch 32",
  "drop 0.1",
  "Wₓᵦ",
  "n=10⁴",
  "CI 95%",
  "OR 1.4",
  "HR 0.92",
];

function columnLines(seed: number, rows: number) {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const a = TOKENS[(seed * 3 + r * 7) % TOKENS.length]!;
    const b = TOKENS[(seed * 5 + r * 11 + 3) % TOKENS.length]!;
    const c = (seed + r * 13) % 1000;
    lines.push(`${a}  ${b}  ${(c * 0.001).toFixed(3)}  ${(c * 7) % 240}/${(c * 3) % 128}`);
  }
  return lines;
}

/* Need enough lines so 2× stacked text blocks (see translateY -50% loop) are taller than the
 * viewport, otherwise the bottom half of each column shows empty space. 60 rows ≈ enough to fill ~900px+ at typical mono sizes. */
const ROWS = 60;
const COLS = 10;

export function AmbientDataStreams() {
  return (
    <div className="pointer-events-none absolute inset-0 -left-px -right-px min-h-full w-[calc(100%+2px)] max-w-none select-none overflow-hidden">
      <style>{`
        @keyframes dataStreamUp { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .data-stream-col .will-change-transform { animation: none !important; }
        }
      `}</style>
      <div className="absolute inset-0 flex h-full w-full min-h-0 min-w-0 justify-between gap-0 opacity-[0.12] [mix-blend-mode:soft-light] sm:gap-px">
        {Array.from({ length: COLS }, (_, ci) => {
          const lines = columnLines(ci, ROWS);
          const text = lines.join("\n");
          return (
            <div
              key={ci}
              className="data-stream-col relative h-full min-h-0 min-w-0 flex-1 overflow-hidden text-[0.55rem] leading-tight sm:text-[0.6rem] md:text-[0.65rem]"
            >
              <div
                className="will-change-transform"
                style={{
                  animation: `dataStreamUp ${28 + (ci % 5) * 5}s linear infinite`,
                  animationDelay: `${-ci * 1.2}s`,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  color: ci % 3 === 0 ? "rgba(52, 211, 153, 0.95)" : ci % 3 === 1 ? "rgba(34, 211, 238, 0.9)" : "rgba(167, 139, 250, 0.9)",
                  letterSpacing: "0.02em",
                }}
              >
                <div className="whitespace-pre">{text}</div>
                <div className="whitespace-pre">{text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
