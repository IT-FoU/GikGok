"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import * as THREE from "three";

import type { FpcSymbol } from "@/modules/game-engine";

import { FPC_SYMBOL_META } from "./config";

function DieBody({
  symbol,
  position,
  settle,
  reducedMotion,
}: {
  symbol: FpcSymbol;
  position: [number, number, number];
  settle: boolean;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const color = useMemo(
    () => new THREE.Color(FPC_SYMBOL_META[symbol].color),
    [symbol],
  );

  useFrame((_, delta) => {
    if (!meshRef.current || settle || reducedMotion) return;
    meshRef.current.rotation.x += delta * 4.2;
    meshRef.current.rotation.y += delta * 5.1;
  });

  return (
    <RigidBody
      position={position}
      colliders="cuboid"
      restitution={0.4}
      linearDamping={0.8}
      angularDamping={0.9}
      type={settle ? "fixed" : "dynamic"}
    >
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[0.85, 0.85, 0.85]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.12} />
      </mesh>
    </RigidBody>
  );
}

function Scene({
  dice,
  reducedMotion,
}: {
  dice: [FpcSymbol, FpcSymbol, FpcSymbol];
  reducedMotion: boolean;
}) {
  const [settle, setSettle] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setSettle(true), 1000);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 4]} intensity={1.15} castShadow />
      <Physics gravity={[0, reducedMotion ? 0 : -12, 0]}>
        <RigidBody type="fixed" position={[0, -1.15, 0]} colliders="cuboid">
          <mesh receiveShadow>
            <boxGeometry args={[7, 0.2, 3.5]} />
            <meshStandardMaterial color="#16382e" />
          </mesh>
        </RigidBody>
        <DieBody
          symbol={dice[0]}
          position={[-1.35, reducedMotion ? 0 : 2.4, 0]}
          settle={settle}
          reducedMotion={reducedMotion}
        />
        <DieBody
          symbol={dice[1]}
          position={[0, reducedMotion ? 0 : 2.8, 0.15]}
          settle={settle}
          reducedMotion={reducedMotion}
        />
        <DieBody
          symbol={dice[2]}
          position={[1.35, reducedMotion ? 0 : 2.5, -0.1]}
          settle={settle}
          reducedMotion={reducedMotion}
        />
      </Physics>
    </>
  );
}

/**
 * Lazy-loaded 3D reveal of an already-settled server result.
 * Physics/animation never calculate outcomes.
 * Remount via `key` when dice change so settle state resets cleanly.
 */
export function DiceReveal3D({
  dice,
  reducedMotion = false,
}: {
  dice: [FpcSymbol, FpcSymbol, FpcSymbol];
  reducedMotion?: boolean;
}) {
  return (
    <div
      className="h-56 w-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[radial-gradient(circle_at_top,#2a6b56,#102820)]"
      role="img"
      aria-label={`${dice[0]}, ${dice[1]}, ${dice[2]}`}
    >
      <Canvas camera={{ position: [0, 2.8, 5], fov: 40 }} shadows>
        <Suspense fallback={null}>
          <Scene
            key={`${dice.join("-")}-${reducedMotion ? "rm" : "full"}`}
            dice={dice}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
