"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

const COL_LINE = new THREE.Color("#6b7fe8");
const COL_HANDOFF = new THREE.Color("#e4fdff");
const COL_INNER = new THREE.Color("#b8a6e8");
const COL_INNER_HOT = new THREE.Color("#ede9fe");
const COL_CORE = new THREE.Color("#7dd3fc");
const COL_CORE_WHITE = new THREE.Color("#ffffff");

function handoffT(t: number) {
  const u = Math.max(0, Math.min(1, (t - 0.68) / 0.2));
  return u * u * (3 - 2 * u);
}

/** 0.62–0.82: line endpoints push outward; eases the handoff. */
function shatterT(t: number) {
  return Math.max(0, Math.min(1, (t - 0.62) / 0.2));
}

function easeOut(sh: number) {
  return 1 - (1 - sh) ** 2.4;
}

export function DharmachakraScene() {
  const scroll = useScroll();
  const linesRef = useRef<THREE.LineSegments>(null);
  const lineCol = useRef(new THREE.Color());
  const wheel = useRef<THREE.Group>(null);
  const innerShell = useRef<THREE.Group>(null);
  const key = useRef<THREE.PointLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const back = useRef<THREE.SpotLight>(null);
  const coreGlow = useRef<THREE.PointLight>(null);

  const colKey = useMemo(() => new THREE.Color("#fff4e8"), []);
  const colKeyHot = useMemo(() => new THREE.Color("#d8f8ff"), []);

  const { edgeGeo, basePos } = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(0.7, 1);
    const edges = new THREE.EdgesGeometry(ico, 18);
    ico.dispose();
    return { edgeGeo: edges, basePos: new Float32Array(edges.attributes.position.array) };
  }, []);

  const matInner = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COL_INNER.clone(),
        wireframe: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    []
  );

  useFrame(() => {
    const t = scroll.offset;
    const s = handoffT(t);
    const sh = shatterT(t);
    const ex = easeOut(sh);
    const wobble = 0.055 * Math.sin(performance.now() * 0.0005);
    const grow = 0.75 + 1.22 * Math.pow(t, 0.45);
    const pop = 1 + 0.52 * s * (1 - sh * 0.45);
    const spread = 1 + ex * 3.6;

    const att = linesRef.current?.geometry?.getAttribute("position");
    if (att?.array) {
      const out = att.array as Float32Array;
      const b = basePos;
      for (let i = 0; i < out.length; i++) {
        out[i] = b[i]! * spread;
      }
      att.needsUpdate = true;
    }

    lineCol.current.copy(COL_LINE).lerp(COL_HANDOFF, s * 0.92);
    const mat = linesRef.current?.material;
    if (mat && "color" in mat) {
      (mat as THREE.LineBasicMaterial).color.copy(lineCol.current);
    }
    const baseOp = 0.72 + 0.25 * Math.pow(t, 0.45);
    const shellFade = 1 - Math.min(0.98, sh * 1.02 * (0.2 + 0.8 * sh * sh));
    if (mat && "opacity" in mat) {
      (mat as THREE.LineBasicMaterial).opacity = Math.min(0.99, baseOp * pop) * shellFade;
    }

    matInner.color.lerpColors(COL_INNER, COL_INNER_HOT, s * 0.75);
    const innerBase = 0.24 + 0.32 * Math.pow(t, 0.5);
    const innerFlicker = Math.max(0, 1 - sh * 1.3);
    matInner.opacity = Math.min(0.62, innerBase * pop * 0.95) * innerFlicker;

    if (key.current) {
      key.current.intensity = 0.5 + 0.75 * (1 - t * 0.35) + 0.55 * s;
      key.current.color.copy(colKey).lerp(colKeyHot, s);
    }
    if (fill.current) {
      fill.current.intensity = 0.4 + 0.35 * (1 - t) + 0.85 * Math.pow(t, 0.7) + 0.5 * s;
    }
    if (back.current) {
      back.current.intensity = 0.85 + 0.9 * (1 - t) * 0.75 + 0.45 * s;
    }
    if (coreGlow.current) {
      coreGlow.current.intensity = 0.5 + 1.45 * Math.pow(t, 0.85) + 1.15 * s;
      coreGlow.current.color.lerpColors(COL_CORE, COL_CORE_WHITE, s * 0.9);
    }

    if (wheel.current) {
      wheel.current.rotation.set(
        t * 0.22 + wobble * 0.32,
        t * 0.5,
        t * 0.12 + wobble * 0.18
      );
      wheel.current.scale.setScalar(grow);
    }
    if (innerShell.current) {
      const innerR = 0.5 * grow * (0.1 + 0.9 * (1 - ex * 0.92));
      innerShell.current.rotation.set(-t * 0.4, t * 0.28, t * 0.18);
      innerShell.current.scale.setScalar(Math.max(0.02, innerR));
    }
  });

  return (
    <group>
      <pointLight ref={key} position={[0, 0, 3.5]} intensity={1.1} color="#fff4e8" distance={20} />
      <pointLight ref={fill} position={[-1.5, 1, 5]} intensity={0.7} color="#c4d0ff" distance={22} />
      <spotLight
        ref={back}
        position={[0, 0, 16]}
        angle={0.55}
        penumbra={0.8}
        intensity={1.75}
        color="#ffffff"
      />
      <pointLight
        ref={coreGlow}
        position={[0, 0, 0]}
        intensity={0.75}
        color="#93e4fc"
        distance={4}
        decay={1.85}
      />

      <group ref={wheel}>
        <lineSegments ref={linesRef} geometry={edgeGeo} frustumCulled={false} renderOrder={1}>
          <lineBasicMaterial
            color={COL_LINE.clone()}
            transparent
            opacity={0.78}
            depthWrite
            toneMapped={false}
          />
        </lineSegments>
        <group ref={innerShell} renderOrder={0}>
          <mesh material={matInner}>
            <icosahedronGeometry args={[0.36, 0]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
