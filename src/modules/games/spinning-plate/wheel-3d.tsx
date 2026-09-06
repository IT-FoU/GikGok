"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { Group } from "three";
import * as THREE from "three";

import { rotationForSlot } from "./config";

function PlateDisk({
  landedSlot,
  reducedMotion,
  quality,
}: {
  landedSlot: number;
  reducedMotion: boolean;
  quality: "low" | "medium" | "high";
}) {
  const group = useRef<Group>(null);
  const targetRad = useMemo(
    () => THREE.MathUtils.degToRad(rotationForSlot(landedSlot) - 360 * 3),
    [landedSlot],
  );
  const segments = quality === "low" ? 24 : quality === "medium" ? 48 : 64;

  useFrame((_, delta) => {
    if (!group.current) return;
    if (reducedMotion) {
      group.current.rotation.y = targetRad;
      return;
    }
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      targetRad,
      2.2,
      delta,
    );
  });

  return (
    <group ref={group}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow={quality === "high"}
        receiveShadow={quality !== "low"}
      >
        <cylinderGeometry args={[1.7, 1.7, 0.18, segments]} />
        <meshStandardMaterial color="#1f6b56" roughness={0.45} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.12, -1.75]} rotation={[0.35, 0, 0]}>
        <coneGeometry args={[0.12, 0.32, 10]} />
        <meshStandardMaterial color="#b8f000" emissive="#5f7a00" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.08, 16]} />
        <meshStandardMaterial color="#b8f000" />
      </mesh>
    </group>
  );
}

/**
 * Lazy-loaded 3D spinning plate reveal of an already-settled server slot.
 * Animation never calculates outcomes.
 */
export function PlateReveal3D({
  landedSlot,
  reducedMotion = false,
  quality = "medium",
  onFpsSample,
}: {
  landedSlot: number;
  reducedMotion?: boolean;
  quality?: "low" | "medium" | "high";
  onFpsSample?: (fps: number) => void;
}) {
  return (
    <div
      className="h-64 w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[radial-gradient(circle_at_top,#2a6b56,#102820)]"
      role="img"
      aria-label={`Landed slot ${landedSlot}`}
    >
      <Canvas
        camera={{ position: [0, 3.4, 3.8], fov: 40 }}
        shadows={quality === "high"}
        dpr={quality === "low" ? 1 : undefined}
        onCreated={() => {
          if (!onFpsSample) return;
          let frames = 0;
          let last = performance.now();
          const sample = () => {
            frames += 1;
            const now = performance.now();
            if (now - last >= 1000) {
              onFpsSample(frames);
              frames = 0;
              last = now;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.85} />
          <directionalLight
            position={[4, 6, 3]}
            intensity={1.15}
            castShadow={quality === "high"}
          />
          <PlateDisk
            key={`${landedSlot}-${reducedMotion}-${quality}`}
            landedSlot={landedSlot}
            reducedMotion={reducedMotion}
            quality={quality}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
