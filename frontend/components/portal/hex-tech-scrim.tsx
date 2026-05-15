/**
 * Diagonal data lanes + fine mesh — under neural, over light wash.
 */
export function HexTechScrim() {
  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .tech-lane { animation: none !important; }
        }
        @keyframes techLane1 { 0%, 100% { transform: translateX(-6%) skewX(-12deg); opacity: 0.35; } 50% { transform: translateX(4%) skewX(-12deg); opacity: 0.5; } }
        @keyframes techLane2 { 0%, 100% { transform: translateX(5%) skewX(8deg); opacity: 0.25; } 50% { transform: translateX(-4%) skewX(8deg); opacity: 0.4; } }
        @keyframes techScan { 0% { background-position: 0% 0%; } 100% { background-position: 100% 100%; } }
      `}</style>
      <div
        className="tech-lane pointer-events-none absolute inset-0 [mix-blend-mode:color-dodge] [background:repeating-linear-gradient(105deg,transparent,transparent_3px,rgba(34,211,238,0.04)_3px,rgba(34,211,238,0.04)_4px),repeating-linear-gradient(-12deg,transparent,transparent_60px,rgba(99,102,241,0.05)_60px,rgba(99,102,241,0.05)_61px)] opacity-50"
        style={{ animation: "techScan 45s linear infinite" }}
        aria-hidden
      />
      <div
        className="tech-lane pointer-events-none absolute -inset-[20%] h-[140%] w-[70%] rounded-full bg-gradient-to-b from-cyan-400/0 via-cyan-300/[0.07] to-violet-500/0 [mix-blend-mode:overlay]"
        style={{ animation: "techLane1 18s ease-in-out infinite" }}
        aria-hidden
      />
      <div
        className="tech-lane pointer-events-none absolute -inset-[15%] left-[20%] h-[120%] w-[55%] rounded-full bg-gradient-to-tr from-fuchsia-500/0 via-indigo-400/[0.06] to-transparent [mix-blend-mode:soft-light]"
        style={{ animation: "techLane2 22s ease-in-out infinite" }}
        aria-hidden
      />
    </>
  );
}
