"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Drei's `ScrollControls` appends a div with a tall inner "fill". We find it by
 * real scroll overflow — not by sibling order (R3F/Next can vary).
 */
function findDreiScrollEl(wrapper: HTMLDivElement | null): HTMLElement | null {
  if (!wrapper) return null;

  const candidates: HTMLElement[] = [];
  for (const n of wrapper.querySelectorAll<HTMLElement>("div")) {
    if (n.children.length < 2) continue;
    const sh = n.scrollHeight;
    const ch = n.clientHeight;
    if (sh <= ch + 30) continue;
    const s = getComputedStyle(n);
    if (s.overflowY !== "auto" && s.overflowY !== "scroll" && s.overflowY !== "overlay") continue;
    candidates.push(n);
  }
  if (candidates.length === 0) return null;
  const range = (h: HTMLElement) => h.scrollHeight - h.clientHeight;
  candidates.sort((a, b) => range(b) - range(a));
  return candidates[0]!;
}

function smoothStep01(t: number) {
  return t * t * (3 - 2 * t);
}

type CommitOpts = {
  /** Authoritative: Drei `ScrollControls` exposes the real scroller on context (`useScroll().el`). */
  dreiScrollElRef: RefObject<HTMLDivElement | null>;
  canvasLayerRef: RefObject<HTMLDivElement | null>;
  portalRootRef: RefObject<HTMLElement | null>;
  durationMs?: number;
};

/**
 * First downward wheel / swipe in the journey runs the full scroll. Listeners
 * are bound on `window` (capture) so the WebGL canvas cannot eat the event
 * before we see it. Works even if the scroll `div` appears a frame late.
 */
export function useMandalaScrollCommit({
  dreiScrollElRef,
  canvasLayerRef,
  portalRootRef,
  durationMs = 4800,
}: CommitOpts) {
  const rafIdRef = useRef(0);
  const playingRef = useRef(false);
  const commitUsedRef = useRef(false);
  const elCacheRef = useRef<HTMLElement | null>(null);
  const duration = durationMs;

  useEffect(() => {
    let alive = true;

    const getEl = (): HTMLElement | null => {
      const fromDrei = dreiScrollElRef.current;
      if (fromDrei?.isConnected) {
        elCacheRef.current = fromDrei;
        return fromDrei;
      }
      const w = canvasLayerRef.current;
      if (elCacheRef.current && w?.contains(elCacheRef.current)) {
        return elCacheRef.current;
      }
      const el = findDreiScrollEl(w);
      elCacheRef.current = el;
      return el;
    };

    const runToEnd = (el: HTMLElement, fromEvent: Event) => {
      if (commitUsedRef.current) return;
      if (playingRef.current) {
        fromEvent.preventDefault();
        return;
      }
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      if (el.scrollTop >= max - 2) return;

      playingRef.current = true;
      const from = el.scrollTop;
      const to = max;
      const t0 = performance.now();

      const step = (now: number) => {
        if (!alive) {
          playingRef.current = false;
          return;
        }
        const t = Math.min(1, (now - t0) / duration);
        const e = smoothStep01(t);
        el.scrollTop = from + (to - from) * e;
        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          playingRef.current = false;
          commitUsedRef.current = true;
        }
      };
      rafIdRef.current = requestAnimationFrame(step);
      fromEvent.preventDefault();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const onWindowWheel = (e: WheelEvent) => {
      if (commitUsedRef.current) return;
      const root = portalRootRef.current;
      if (!root || !root.isConnected) return;
      const t = e.target;
      if (!(t instanceof Node) || !root.contains(t)) return;
      if (playingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.deltaY <= 0) return;
      const el = getEl();
      if (el) runToEnd(el, e);
    };

    let touchY0 = 0;
    const onTouchStart = (e: TouchEvent) => {
      const root = portalRootRef.current;
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
      touchY0 = e.touches[0]!.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (commitUsedRef.current) return;
      const root = portalRootRef.current;
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
      if (playingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const y = e.touches[0]!.clientY;
      if (touchY0 - y > 16) {
        const el = getEl();
        if (el) runToEnd(el, e);
      }
    };

    window.addEventListener("wheel", onWindowWheel, { capture: true, passive: false });
    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });

    return () => {
      alive = false;
      cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener("wheel", onWindowWheel, { capture: true });
      window.removeEventListener("touchstart", onTouchStart, { capture: true });
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, [dreiScrollElRef, canvasLayerRef, portalRootRef, duration]);
}
