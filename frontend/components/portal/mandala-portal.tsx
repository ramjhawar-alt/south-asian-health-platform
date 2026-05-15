"use client";

import { useRef, useEffect, useLayoutEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Sparkles, ScrollControls, Stars, useScroll } from "@react-three/drei";
import * as THREE from "three";
import Link from "next/link";
import { DharmachakraScene } from "@/components/resources/dharmachakra-scene";
import { IntricateMandala } from "@/components/resources/intricate-mandala";
import { AmbientDataStreams } from "@/components/portal/ambient-data-streams";
import { HexTechScrim } from "@/components/portal/hex-tech-scrim";
import { NeuralScrim } from "@/components/portal/neural-scrim";
import { useMandalaScrollCommit } from "@/components/portal/use-mandala-scroll-commit";

/** Binds Drei's real scroll `div` (from context) for one-shot autoscroll — no DOM guessing. */
function ScrollElBind({ targetRef }: { targetRef: React.MutableRefObject<HTMLDivElement | null> }) {
  const { el } = useScroll();
  useLayoutEffect(() => {
    targetRef.current = el;
    return () => {
      targetRef.current = null;
    };
  }, [el, targetRef]);
  return null;
}

function invlerp01(a: number, b: number, v: number) {
  if (b <= a) return 0;
  return Math.max(0, Math.min(1, (v - a) / (b - a)));
}

function smooth01(t: number) {
  return t * t * (3 - 2 * t);
}

export function JourneyRig({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const { camera, scene } = useThree();
  const scroll = useScroll();
  const colA = useMemo(() => new THREE.Color("#050414"), []);
  const colB = useMemo(() => new THREE.Color("#1e1b4b"), []);
  const colCyan = useMemo(() => new THREE.Color("#0891b2"), []);
  const colMagenta = useMemo(() => new THREE.Color("#a21caf"), []);
  const colB2 = useMemo(() => new THREE.Color("#f2ebe3"), []);
  const colGlow = useMemo(() => new THREE.Color("#fffaf4"), []);
  const colWarm = useMemo(() => new THREE.Color("#c2410c"), []);
  /** Scratch colors — avoid per-frame allocations in the scroll path */
  const baseMain = useMemo(() => new THREE.Color(), []);
  const towardCream = useMemo(() => new THREE.Color(), []);
  const burstColor = useMemo(() => new THREE.Color(), []);
  const fogColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const t = scroll.offset;
    progressRef.current = t;

    /* Front-loaded: a lot of the dolly + FOV read happens in the first half of the scroll. */
    const travel = Math.pow(Math.max(0, Math.min(1, t)), 0.5);
    const z = THREE.MathUtils.lerp(9.9, -0.35, travel);

    const w = (1 - t) * 0.28;
    camera.position.set(
      Math.sin(t * 5.5) * 0.16 * w,
      Math.cos(t * 2.8) * 0.1 * w,
      z
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = THREE.MathUtils.lerp(54, 75, smooth01(travel));
      if (Math.abs(camera.fov - fov) > 0.04) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }

    // Deep space → indigo, with a subtle early cyan / mid magenta rim
    const edgeCyan = (1 - t) * 0.14;
    const edgeMag = (1 - t) * 0.08 * Math.sin(t * Math.PI);
    baseMain.copy(colA).lerp(colB, Math.pow(t, 0.36));
    if (edgeCyan > 0.001) baseMain.lerp(colCyan, edgeCyan);
    if (edgeMag > 0.001) baseMain.lerp(colMagenta, edgeMag);
    towardCream.copy(baseMain).lerp(colB2, Math.pow(t, 0.55) * 0.85);
    const saffronBand = Math.max(0, 1 - Math.abs(t - 0.48) / 0.22) * 0.11;
    if (saffronBand > 0.001) {
      towardCream.lerp(colWarm, saffronBand);
    }

    if (t > 0.68) {
      const burst = invlerp01(0.68, 1, t);
      burstColor.copy(towardCream).lerp(colGlow, Math.pow(t, 0.35) * 0.4);
      burstColor.lerp(colGlow, Math.pow(burst, 0.55) * 0.75);
      scene.background = burstColor;
    } else {
      scene.background = towardCream;
    }
    if (scene.fog instanceof THREE.Fog) {
      const bg = scene.background;
      if (bg instanceof THREE.Color) {
        fogColor.copy(bg);
        scene.fog.color.copy(fogColor);
      }
      const d = smooth01(travel);
      scene.fog.near = THREE.MathUtils.lerp(0.9, 0.04, d);
      scene.fog.far = THREE.MathUtils.lerp(40, 11, d);
    }
  });
  return null;
}

type PortalDomRefs = {
  canvasLayer: React.RefObject<HTMLDivElement | null>;
  mandala: React.RefObject<HTMLDivElement | null>;
  burst: React.RefObject<HTMLDivElement | null>;
  reveal: React.RefObject<HTMLDivElement | null>;
  /** Tool grid copy only — parent shell stays opaque so VFX is never visible through the panel. */
  revealContent: React.RefObject<HTMLDivElement | null>;
  noise: React.RefObject<HTMLDivElement | null>;
  chrome: React.RefObject<HTMLDivElement | null>;
  tunnelBlock: React.RefObject<HTMLDivElement | null>;
  dataField: React.RefObject<HTMLDivElement | null>;
  neural: React.RefObject<HTMLDivElement | null>;
};

/**
 * Drives 2D overlay DOM from the same damped `scroll.offset` as WebGL (R3F useFrame), instead of
 * a second browser rAF that could fall out of phase and feel glitchy.
 */
function HtmlOverlayRig({
  mountTimeRef,
  reducedMotionRef,
  parallaxXRef,
  parallaxYRef,
  parallaxTargetXRef,
  parallaxTargetYRef,
  dom,
  lastNeuralFilterRef,
}: {
  mountTimeRef: React.MutableRefObject<number>;
  reducedMotionRef: React.MutableRefObject<boolean>;
  parallaxXRef: React.MutableRefObject<number>;
  parallaxYRef: React.MutableRefObject<number>;
  parallaxTargetXRef: React.MutableRefObject<number>;
  parallaxTargetYRef: React.MutableRefObject<number>;
  dom: PortalDomRefs;
  lastNeuralFilterRef: React.MutableRefObject<string>;
}) {
  const scroll = useScroll();
  const lastMandalaFilterRef = useRef("");

  useFrame(() => {
    const p = scroll.offset;

    const tunnelOff = p > 0.88;
    if (dom.canvasLayer.current) {
      if (tunnelOff) {
        dom.canvasLayer.current.style.visibility = "hidden";
        dom.canvasLayer.current.style.opacity = "0";
      } else {
        dom.canvasLayer.current.style.visibility = "visible";
        const cVis = 1 - smooth01(invlerp01(0.8, 0.91, p));
        dom.canvasLayer.current.style.opacity = String(Math.max(0, Math.min(1, cVis)));
      }
    }
    {
      const hWide = smooth01(invlerp01(0.52, 0.92, p));
      const hSnap = smooth01(invlerp01(0.64, 0.88, p));
      if (dom.dataField.current) {
        if (tunnelOff) {
          dom.dataField.current.style.opacity = "0";
        } else {
          dom.dataField.current.style.opacity = String(Math.max(0.1, 1 - 0.82 * hWide));
        }
      }
      if (dom.neural.current) {
        if (tunnelOff) {
          dom.neural.current.style.opacity = "0.5";
          dom.neural.current.style.filter = "none";
          lastNeuralFilterRef.current = "";
        } else {
          const op = 0.18 + 0.75 * hWide;
          dom.neural.current.style.opacity = op.toFixed(3);
          const b = 1.04 + 0.32 * hSnap;
          const sat = 1.15 + 0.5 * hSnap;
          const glow = 10 + 14 * hSnap;
          const filterStr = `brightness(${b.toFixed(2)}) saturate(${sat.toFixed(2)}) drop-shadow(0 0 ${glow.toFixed(1)}px rgba(34, 211, 238, 0.35))`;
          if (filterStr !== lastNeuralFilterRef.current) {
            dom.neural.current.style.filter = filterStr;
            lastNeuralFilterRef.current = filterStr;
          }
        }
      }
    }
    if (dom.burst.current) {
      if (tunnelOff) {
        dom.burst.current.style.visibility = "hidden";
        dom.burst.current.style.opacity = "0";
      } else {
        dom.burst.current.style.visibility = "visible";
        const build = invlerp01(0.58, 0.7, p);
        const snap = invlerp01(0.64, 0.78, p);
        const fall = 1 - invlerp01(0.9, 1, p);
        dom.burst.current.style.opacity = String(Math.max(0, (build * 0.4 + snap * 0.75) * fall * 0.7));
      }
    }
    if (dom.reveal.current) {
      const r = smooth01(invlerp01(0.7, 0.94, p));
      const lift = (1 - r) * 20;
      if (p < 0.68) {
        dom.reveal.current.style.opacity = "0";
        dom.reveal.current.style.visibility = "hidden";
        dom.reveal.current.style.pointerEvents = "none";
      } else {
        dom.reveal.current.style.visibility = "visible";
        dom.reveal.current.style.opacity = "1";
        dom.reveal.current.style.transform = `translate3d(0, ${lift.toFixed(1)}px, 0)`;
        dom.reveal.current.style.pointerEvents = p > 0.8 ? "auto" : "none";
      }
    }
    if (dom.revealContent.current) {
      // Must match the reveal shell: a second opacity ramp (0.7–0.94) here kept
      // the entire tools grid + WebGL at ~0–15% for most of the journey — invisible.
      dom.revealContent.current.style.opacity = p < 0.68 ? "0" : "1";
    }
    if (dom.mandala.current) {
      if (tunnelOff) {
        dom.mandala.current.style.visibility = "hidden";
        dom.mandala.current.style.opacity = "0";
      } else {
        dom.mandala.current.style.visibility = "visible";
        const reduced = reducedMotionRef.current;
        const tSec = (performance.now() - mountTimeRef.current) / 1000;
        const spawnT = reduced ? 1 : Math.min(1, tSec / 1.12);
        const spawnEase = 1 - (1 - spawnT) ** 2.2;
        const opIn = reduced ? 1 : Math.min(1, tSec / 0.55);
        const parallaxAtten = 1 - smooth01(invlerp01(0.35, 0.82, p));
        parallaxXRef.current += (parallaxTargetXRef.current - parallaxXRef.current) * 0.08;
        parallaxYRef.current += (parallaxTargetYRef.current - parallaxYRef.current) * 0.08;
        const px = parallaxXRef.current * 0.85 * parallaxAtten;
        const py = parallaxYRef.current * 0.85 * parallaxAtten;
        const s = 0.5 + 4.0 * Math.pow(p, 0.68);
        const sSpawn = s * (0.72 + 0.28 * spawnEase);
        const rot = p * 12;
        const lateFade = p < 0.9 ? 1 : 1 - invlerp01(0.9, 0.99, p);
        const flatAtten = 1 - 0.5 * smooth01(invlerp01(0.18, 0.8, p));
        const breakDim = 1 - 0.38 * smooth01(invlerp01(0.62, 0.84, p));
        const op = Math.max(0, lateFade * (0.4 + 0.6 * opIn) * flatAtten * breakDim);
        const bloom = reduced ? 0 : 20 + 38 * (1 - spawnEase);
        const mFilter = reduced
          ? "none"
          : (() => {
              const ds1 = 8 + bloom * 0.4;
              const ds2 = 14 + bloom * 0.5;
              return `drop-shadow(0 0 ${ds1.toFixed(0)}px rgba(34, 211, 238, 0.25)) drop-shadow(0 0 ${ds2.toFixed(0)}px rgba(165, 180, 250, 0.5))`;
            })();
        if (mFilter !== lastMandalaFilterRef.current) {
          dom.mandala.current.style.filter = mFilter;
          lastMandalaFilterRef.current = mFilter;
        }
        const tf = `translate3d(calc(-50% + ${px.toFixed(1)}px), calc(-50% + ${py.toFixed(1)}px), 0) scale(${sSpawn.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
        dom.mandala.current.style.transform = tf;
        dom.mandala.current.style.opacity = op.toFixed(3);
        dom.mandala.current.style.setProperty("--mandala-t", String(p));
      }
    }
    if (dom.noise.current) {
      if (tunnelOff) {
        dom.noise.current.style.visibility = "hidden";
      } else {
        dom.noise.current.style.visibility = "visible";
        dom.noise.current.style.opacity = String(0.03 + (1 - p) * 0.1);
      }
    }
    if (dom.chrome.current) {
      const hide = 1 - invlerp01(0.64, 0.78, p);
      dom.chrome.current.style.opacity = String(Math.max(0, hide));
      dom.chrome.current.style.visibility = p > 0.82 ? "hidden" : "visible";
    }
    if (dom.tunnelBlock.current) {
      const t = p > 0.78 ? smooth01(invlerp01(0.78, 0.92, p)) : 0;
      dom.tunnelBlock.current.style.opacity = String(t);
    }
  });
  return null;
}

function SceneR3F({
  progressRef,
  htmlOverlay,
  dreiScrollElRef,
}: {
  progressRef: React.MutableRefObject<number>;
  dreiScrollElRef: React.MutableRefObject<HTMLDivElement | null>;
  htmlOverlay: {
    mountTimeRef: React.MutableRefObject<number>;
    reducedMotionRef: React.MutableRefObject<boolean>;
    parallaxXRef: React.MutableRefObject<number>;
    parallaxYRef: React.MutableRefObject<number>;
    parallaxTargetXRef: React.MutableRefObject<number>;
    parallaxTargetYRef: React.MutableRefObject<number>;
    dom: PortalDomRefs;
    lastNeuralFilterRef: React.MutableRefObject<string>;
  };
}) {
  return (
    <ScrollControls
      pages={5.4}
      distance={1}
      damping={0.2}
      maxSpeed={Number.POSITIVE_INFINITY}
      style={{ position: "absolute" }}
    >
      <ScrollElBind targetRef={dreiScrollElRef} />
      <JourneyRig progressRef={progressRef} />
      <HtmlOverlayRig
        mountTimeRef={htmlOverlay.mountTimeRef}
        reducedMotionRef={htmlOverlay.reducedMotionRef}
        parallaxXRef={htmlOverlay.parallaxXRef}
        parallaxYRef={htmlOverlay.parallaxYRef}
        parallaxTargetXRef={htmlOverlay.parallaxTargetXRef}
        parallaxTargetYRef={htmlOverlay.parallaxTargetYRef}
        dom={htmlOverlay.dom}
        lastNeuralFilterRef={htmlOverlay.lastNeuralFilterRef}
      />
      <ambientLight intensity={0.38} color="#eef2ff" />
      <fog attach="fog" args={["#0f0a1c", 1.2, 42]} />
      <Suspense fallback={null}>
        <Environment preset="night" environmentIntensity={0.2} environmentRotation={[0, 1.2, 0.15]} />
        <Stars
          radius={80}
          depth={40}
          count={300}
          factor={2.2}
          saturation={0.12}
          fade
          speed={0.3}
        />
        <Sparkles
          count={32}
          scale={[18, 18, 12]}
          size={0.75}
          speed={0.15}
          opacity={0.32}
          color="#a5b4fc"
        />
        <Sparkles
          count={16}
          scale={[9, 9, 5]}
          size={0.45}
          speed={0.1}
          opacity={0.28}
          color="#fde68a"
        />
        <Sparkles
          count={12}
          scale={[22, 22, 9]}
          size={0.4}
          speed={0.07}
          opacity={0.18}
          color="#22d3ee"
        />
        <Sparkles
          count={8}
          scale={[20, 20, 8]}
          size={0.32}
          speed={0.05}
          opacity={0.14}
          color="#e879f9"
        />
        <DharmachakraScene />
      </Suspense>
    </ScrollControls>
  );
}

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

export type MandalaPortalProps = {
  viewport: "full" | "belowNav";
  reveal: ReactNode;
  cornerLabel?: string;
  regionAriaLabel: string;
  showSkip?: boolean;
  skipHref?: string;
  skipLabel?: string;
  /** Centered over the journey (e.g. typewriter title on home) */
  hero?: ReactNode;
};

const HEIGHT: Record<MandalaPortalProps["viewport"], string> = {
  full: "100dvh",
  belowNav: "calc(100dvh - 3.5rem)",
};

const MINH: Record<MandalaPortalProps["viewport"], string> = {
  full: "min-h-[100dvh]",
  belowNav: "min-h-[calc(100dvh-3.5rem)]",
};

function MandalaPortalStatic({
  viewport,
  reveal,
  cornerLabel,
  regionAriaLabel,
  hero,
}: MandalaPortalProps) {
  const h = HEIGHT[viewport];
  return (
    <div
      className="bg-[var(--background)] text-[var(--foreground)]"
      style={{ minHeight: h }}
      role="region"
      aria-label={regionAriaLabel}
    >
      {hero && (
        <div className="relative overflow-hidden bg-gradient-to-b from-[#05030a] via-[#1a0f3d] to-[var(--background)] px-4 pb-10 pt-14 text-center">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(99,102,241,0.25) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 100% 30%, rgba(6,182,212,0.1) 0%, transparent 50%)",
            }}
            aria-hidden
          />
          <div className="relative">{hero}</div>
        </div>
      )}
      {cornerLabel ? (
        <p className="px-4 pt-4 text-center text-[0.7rem] font-medium uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
          {cornerLabel}
        </p>
      ) : null}
      <div className="mx-auto w-full max-w-7xl px-2 py-2 sm:px-4 sm:py-3 md:px-6">
        {reveal}
      </div>
    </div>
  );
}

function MandalaPortalWithScroll({
  viewport,
  reveal,
  cornerLabel,
  regionAriaLabel,
  showSkip = false,
  skipHref = "#",
  skipLabel = "Skip",
  hero,
}: MandalaPortalProps) {
  const h = HEIGHT[viewport];
  const minh = MINH[viewport];

  const progressRef = useRef(0);
  const mountTimeRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const parallaxXRef = useRef(0);
  const parallaxYRef = useRef(0);
  const parallaxTargetXRef = useRef(0);
  const parallaxTargetYRef = useRef(0);
  const portalRootRef = useRef<HTMLDivElement>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  const dreiScrollElRef = useRef<HTMLDivElement | null>(null);
  const mandalaRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const noiseRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const tunnelBlockRef = useRef<HTMLDivElement>(null);
  const dataFieldLayerRef = useRef<HTMLDivElement>(null);
  const neuralFieldRef = useRef<HTMLDivElement>(null);
  const revealContentRef = useRef<HTMLDivElement>(null);
  const lastNeuralFilterRef = useRef("");

  /** First wheel (capture on portal — hits canvas) or swipe auto-plays the full journey. */
  useMandalaScrollCommit({
    dreiScrollElRef,
    canvasLayerRef,
    portalRootRef,
    durationMs: 4000,
  });

  useEffect(() => {
    mountTimeRef.current = performance.now();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      reducedMotionRef.current = mq.matches;
    };
    syncMotion();
    mq.addEventListener("change", syncMotion);

    const onPointer = (e: PointerEvent) => {
      if (reducedMotionRef.current) {
        parallaxTargetXRef.current = 0;
        parallaxTargetYRef.current = 0;
        return;
      }
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      parallaxTargetXRef.current = (e.clientX / w - 0.5) * 20;
      parallaxTargetYRef.current = (e.clientY / h - 0.5) * 14;
    };
    const onLeave = () => {
      parallaxTargetXRef.current = 0;
      parallaxTargetYRef.current = 0;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.body.addEventListener("mouseleave", onLeave);

    return () => {
      mq.removeEventListener("change", syncMotion);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.body.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={portalRootRef}
      className="mandala-portal-root relative w-full select-none touch-pan-y overflow-hidden overscroll-y-contain [animation:mandalaAurora_38s_ease-in-out_infinite] motion-reduce:[animation:none]"
      style={{
        height: h,
        background:
          "linear-gradient(153deg, #02000a 0%, #0a0520 8%, #12082c 20%, #1e1a4a 38%, #3d2a7a 52%, #5b2d9e 60%, #6b21b6 68%, #a89a78 88%, #fef9e0 100%), radial-gradient(ellipse 100% 80% at 50% 0%, rgba(34, 211, 238, 0.12) 0%, transparent 50%)",
        backgroundSize: "200% 200%, 100% 100%",
        boxShadow: "inset 0 0 120px rgba(0,0,0,0.55), inset 0 -40px 80px rgba(15,8,30,0.4)",
      }}
    >
      <style>{`
        @keyframes mandalaAurora {
          0%, 100% { background-position: 0% 35%; }
          50% { background-position: 100% 70%; }
        }
        @keyframes portalConic {
          0% { transform: rotate(0deg) scale(1.2); }
          100% { transform: rotate(360deg) scale(1.2); }
        }
        @keyframes portalDrift {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.04); }
        }
      `}</style>

      <div ref={canvasLayerRef} className="absolute inset-0 z-0 h-full w-full" style={{ opacity: 1 }}>
        <Canvas
          className="h-full w-full"
          dpr={[1, 1]}
          frameloop="always"
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
            alpha: false,
            stencil: false,
            depth: true,
          }}
          camera={{ fov: 54, position: [0, 0, 9.9], near: 0.1, far: 140 }}
        >
          <SceneR3F
            progressRef={progressRef}
            dreiScrollElRef={dreiScrollElRef}
            htmlOverlay={{
              mountTimeRef,
              reducedMotionRef,
              parallaxXRef,
              parallaxYRef,
              parallaxTargetXRef,
              parallaxTargetYRef,
              lastNeuralFilterRef,
              dom: {
                canvasLayer: canvasLayerRef,
                mandala: mandalaRef,
                burst: burstRef,
                reveal: revealRef,
                revealContent: revealContentRef,
                noise: noiseRef,
                chrome: chromeRef,
                tunnelBlock: tunnelBlockRef,
                dataField: dataFieldLayerRef,
                neural: neuralFieldRef,
              },
            }}
          />
        </Canvas>
      </div>

      {/* Light field over WebGL */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] mix-blend-screen"
        style={{ animation: "portalDrift 16s ease-in-out infinite" }}
        aria-hidden
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 100% 70% at 50% 10%, rgba(99,102,241,0.35) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 100% 40%, rgba(6,182,212,0.2) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 0% 60%, rgba(192,38,211,0.12) 0%, transparent 50%)",
          }}
        />
        <div
          className="absolute -left-1/2 -top-1/2 h-[200%] w-[200%] opacity-[0.24] motion-reduce:hidden"
          style={{ animation: "portalConic 140s linear infinite" }}
        >
          <div
            className="h-full w-full"
            style={{
              background:
                "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(99,102,241,0.25) 50deg, transparent 100deg, rgba(34,211,238,0.15) 180deg, transparent 220deg, rgba(232,121,250,0.12) 300deg, transparent 360deg)",
            }}
          />
        </div>
        <div
          className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:40px_40px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        />
        <div
          className="absolute inset-0 [background:repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.02)_2px,rgba(255,255,255,0.02)_3px)] opacity-40"
        />
      </div>

      {/* Scrolling data tokens + hex + neural */}
      <div className="pointer-events-none absolute inset-0 z-[2] h-full w-full">
        <div ref={dataFieldLayerRef} className="absolute inset-0 h-full w-full" style={{ opacity: 1 }}>
          <AmbientDataStreams />
        </div>
        <HexTechScrim />
        <div
          ref={neuralFieldRef}
          className="absolute inset-0 h-full w-full"
          style={{
            opacity: 0.22,
            filter: "brightness(1.05) saturate(1.18) drop-shadow(0 0 10px rgba(34, 211, 238, 0.22))",
          }}
        >
          <NeuralScrim />
        </div>
      </div>

      <div
        ref={noiseRef}
        className="pointer-events-none absolute inset-0 z-[3] [background-size:180px_180px] [background-image:repeating-radial-gradient(circle_at_50%_50%,rgba(200,200,255,0.05)_0,transparent_1px,transparent_3px),repeating-radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.06)_0,transparent_1px,transparent_4px)] mix-blend-overlay"
        style={{ opacity: 0.12 }}
        aria-hidden
      />

      <div
        ref={mandalaRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-[4] w-[min(99vmin,860px)] will-change-transform drop-shadow-[0_0_30px_rgba(99,102,241,0.25)]"
        style={{
          transform: "translate3d(-50%, -50%, 0) scale(0.72) rotate(0deg)",
          opacity: 0.35,
          ["--mandala-t" as string]: 0,
        }}
        aria-hidden
      >
        <IntricateMandala className="h-auto w-full drop-shadow-[0_0_0.5rem_rgba(55,48,163,0.18)]" />
      </div>

      <div
        ref={burstRef}
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,253,248,0.5) 0%, rgba(196,181,253,0.14) 32%, rgba(254,235,200,0.1) 42%, transparent 58%)",
          mixBlendMode: "soft-light",
        }}
        aria-hidden
      />

      <div
        ref={tunnelBlockRef}
        className="pointer-events-none absolute inset-0 z-[15] bg-[var(--background)]"
        style={{ opacity: 0 }}
        aria-hidden
      />

      <div
        ref={revealRef}
        className="absolute inset-0 z-30 min-h-0 overflow-hidden overscroll-y-contain [will-change:transform] motion-reduce:[will-change:auto]"
        style={{ opacity: 0, pointerEvents: "none", visibility: "hidden" }}
        role="region"
        aria-label={regionAriaLabel}
      >
        <div
          className={`flex h-full min-h-0 w-full flex-col border-t border-[var(--card-border)]/60 bg-[var(--background)] py-1.5 sm:py-2 ${minh}`}
        >
          <div ref={revealContentRef} className="min-h-0 flex-1">
            {reveal}
          </div>
        </div>
      </div>

      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between p-4 md:p-6"
      >
        {hero ? (
          <div className="relative w-full">
            {cornerLabel ? (
              <p className="absolute left-0 top-0 z-10 max-w-[10rem] text-[0.7rem] font-medium uppercase leading-relaxed tracking-[0.28em] text-white/50">
                {cornerLabel}
              </p>
            ) : null}
            <div className="pointer-events-none flex justify-center px-1 sm:px-3">
              <div className="max-w-[min(96vw,42rem)] text-center">{hero}</div>
            </div>
            {showSkip ? (
              <div className="absolute right-0 top-0 z-10">
                <Link
                  href={skipHref}
                  className="pointer-events-auto rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[0.7rem] font-medium tracking-wide text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white/95"
                  prefetch
                >
                  {skipLabel}
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            {cornerLabel ? (
              <p className="max-w-[10rem] text-[0.7rem] font-medium uppercase leading-relaxed tracking-[0.28em] text-white/50">
                {cornerLabel}
              </p>
            ) : (
              <span className="min-w-0" />
            )}
            {showSkip ? (
              <Link
                href={skipHref}
                className="pointer-events-auto rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[0.7rem] font-medium tracking-wide text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white/95"
                prefetch
              >
                {skipLabel}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared scroll-through mandala + 3D frame; reveal `children` after scroll.
 * When `prefers-reduced-motion: reduce`, shows hero + reveal without WebGL.
 */
export function MandalaPortal(props: MandalaPortalProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return <MandalaPortalStatic {...props} />;
  }
  return <MandalaPortalWithScroll {...props} />;
}
