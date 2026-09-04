"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import * as THREE from "three";

const FACE_COLORS = [
  "#f4efe6",
  "#ebe2d4",
  "#e2d6c4",
  "#d9cbb8",
  "#d0c0ac",
  "#c7b5a0",
];

function DieBody({
  value,
  position,
  settle,
  reducedMotion,
  quality,
}: {
  value: number;
  position: [number, number, number];
  settle: boolean;
  reducedMotion: boolean;
  quality: "low" | "medium" | "high";
}) {
  const meshRef = useRef<Mesh>(null);
  const color = useMemo(
    () => new THREE.Color(FACE_COLORS[(value - 1) % FACE_COLORS.length]),
    [value],
  );

  useFrame((_, delta) => {
    if (!meshRef.current || settle || reducedMotion) return;
    const speed = quality === "high" ? 5.5 : 4.2;
    meshRef.current.rotation.x += delta * speed;
    meshRef.current.rotation.y += delta * (speed + 0.8);
  });

  return (
    <RigidBody
      position={position}
      colliders="cuboid"
      restitution={0.35}
      linearDamping={0.85}
      angularDamping={0.95}
      type={settle ? "fixed" : "dynamic"}
    >
      <mesh ref={meshRef} castShadow={quality !== "low"}>
        <boxGeometry args={[0.85, 0.85, 0.85]} />
        <meshStandardMaterial
          color={color}
          roughness={0.45}
          metalness={0.05}
        />
      </mesh>
    </RigidBody>
  );
}

function Scene({
  dice,
  reducedMotion,
  quality,
}: {
  dice: [number, number, number];
  reducedMotion: boolean;
  quality: "low" | "medium" | "high";
}) {
  const [settle, setSettle] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setSettle(true), 1000);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.1}
        castShadow={quality === "high"}
      />
      <Physics gravity={[0, reducedMotion ? 0 : -12, 0]}>
        <RigidBody type="fixed" position={[0, -1.15, 0]} colliders="cuboid">
          <mesh receiveShadow={quality !== "low"}>
            <boxGeometry args={[7, 0.2, 3.5]} />
            <meshStandardMaterial color="#16382e" />
          </mesh>
        </RigidBody>
        <DieBody
          value={dice[0]}
          position={[-1.35, reducedMotion ? 0 : 2.4, 0]}
          settle={settle}
          reducedMotion={reducedMotion}
          quality={quality}
        />
        <DieBody
          value={dice[1]}
          position={[0, reducedMotion ? 0 : 2.8, 0.15]}
          settle={settle}
          reducedMotion={reducedMotion}
          quality={quality}
        />
        <DieBody
          value={dice[2]}
          position={[1.35, reducedMotion ? 0 : 2.5, -0.1]}
          settle={settle}
          reducedMotion={reducedMotion}
          quality={quality}
        />
      </Physics>
    </>
  );
}

/** Lazy-loaded 3D reveal of server-settled High–Low dice. */
export function DiceReveal3D({
  dice,
  reducedMotion = false,
  quality = "medium",
}: {
  dice: [number, number, number];
  reducedMotion?: boolean;
  quality?: "low" | "medium" | "high";
}) {
  return (
    <div
      className="h-56 w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[radial-gradient(circle_at_top,#2a6b56,#102820)]"
      role="img"
      aria-label={`${dice[0]}, ${dice[1]}, ${dice[2]}`}
    >
      <Canvas
        camera={{ position: [0, 2.8, 5], fov: 40 }}
        shadows={quality === "high"}
        dpr={quality === "low" ? 1 : undefined}
      >
        <Suspense fallback={null}>
          <Scene
            key={`${dice.join("-")}-${reducedMotion ? "rm" : "full"}-${quality}`}
            dice={dice}
            reducedMotion={reducedMotion}
            quality={quality}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
