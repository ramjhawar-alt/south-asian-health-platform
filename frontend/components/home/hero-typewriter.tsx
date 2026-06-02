"use client";

import { useEffect, useState, useRef } from "react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

function delayForChar(ch: string) {
  if (ch === " ") return 115;
  if (",.;:!?".includes(ch)) return 200;
  return 64 + Math.random() * 18;
}

type HeroTypewriterProps = {
  text: string;
  className?: string;
};

/**
 * Single-line typewriter; full string when prefers-reduced-motion, with aria-live after completion.
 * Uses variable pauses (spaces, punctuation) for a calmer, more deliberate rhythm.
 */
export function HeroTypewriter({ text, className = "" }: HeroTypewriterProps) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? text : "");
  const [done, setDone] = useState(reduced);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setShown(text);
      setDone(true);
      return;
    }
    setShown("");
    setDone(false);
    let i = 0;

    const step = () => {
      if (i >= text.length) {
        setDone(true);
        return;
      }
      i += 1;
      setShown(text.slice(0, i));
      const ch = text[i - 1] ?? "";
      const wait = delayForChar(ch);
      tickRef.current = window.setTimeout(step, wait);
    };

    const startDelay = 260;
    tickRef.current = window.setTimeout(step, startDelay);
    return () => {
      if (tickRef.current != null) window.clearTimeout(tickRef.current);
    };
  }, [text, reduced]);

  return (
    <h1
      className={`font-[family:var(--font-anek-devanagari),var(--font-fraunces),Georgia,serif] text-[clamp(1.85rem,5.5vw,3.75rem)] font-semibold leading-tight tracking-[0.04em] sm:whitespace-nowrap ${className}`}
      aria-live={done ? "polite" : "off"}
    >
      <span
        className="bg-gradient-to-br from-white via-cyan-100/95 to-violet-200/90 bg-clip-text text-transparent [text-shadow:0_0_40px_rgba(165,180,252,0.45),0_0_80px_rgba(34,211,238,0.15)]"
        style={{ WebkitTextFillColor: "transparent" }}
      >
        {shown}
      </span>
      {!done && (
        <span
          className="ml-0.5 inline-block h-[0.72em] w-[2px] translate-y-[0.04em] rounded-sm bg-gradient-to-b from-cyan-200/90 to-violet-300/80 align-middle shadow-[0_0_12px_rgba(165,180,252,0.7)] [animation:cursorBlink_1.1s_ease-in-out_infinite] motion-reduce:animate-none"
          aria-hidden
        />
      )}
      <style>{`
        @keyframes cursorBlink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0.2; }
        }
      `}</style>
    </h1>
  );
}
