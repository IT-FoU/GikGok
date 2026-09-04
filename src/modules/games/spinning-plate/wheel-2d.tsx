"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/modules/localization/provider";

import {
  PLATE_CONFIG,
  rotationForSlot,
  slotIcon,
  slotMultiplier,
} from "./config";

const SLOT_COLORS = [
  "#1f8a70",
  "#2a9d8f",
  "#d9684a",
  "#c45c26",
  "#c9a227",
  "#b33b3b",
  "#4a7c59",
  "#3d5a80",
  "#6b4c9a",
  "#8b5e3c",
  "#2f6f6a",
  "#9b2226",
];

function wedgePath(index: number, inner = 28, outer = 96): string {
  const sweep = PLATE_CONFIG.degreesPerSlot;
  const start = -90 + index * sweep;
  const end = start + sweep;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = 100 + outer * Math.cos(toRad(start));
  const y1 = 100 + outer * Math.sin(toRad(start));
  const x2 = 100 + outer * Math.cos(toRad(end));
  const y2 = 100 + outer * Math.sin(toRad(end));
  const x3 = 100 + inner * Math.cos(toRad(end));
  const y3 = 100 + inner * Math.sin(toRad(end));
  const x4 = 100 + inner * Math.cos(toRad(start));
  const y4 = 100 + inner * Math.sin(toRad(start));
  return `M ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
}

export function PlateWheel2D({
  selectedSlot,
  landedSlot,
  spinning,
  locked,
  onSelect,
}: {
  selectedSlot: number;
  landedSlot?: number | null;
  spinning?: boolean;
  locked?: boolean;
  onSelect?: (slot: number) => void;
}) {
  const t = useTranslations();
  const rotation =
    landedSlot == null ? 0 : rotationForSlot(landedSlot) - 360 * 3;

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2" aria-hidden>
        <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-[var(--brand-accent)]" />
      </div>
      <p className="sr-only">{t("plate.pointerHint")}</p>

      <svg
        viewBox="0 0 200 200"
        className={cn(
          "h-auto w-full drop-shadow-sm transition-transform ease-out",
          spinning && landedSlot == null && "animate-spin",
        )}
        style={{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: landedSlot ? "1.4s" : "0.2s",
        }}
        role="img"
        aria-label={t("plate.wheelLabel")}
      >
        {Array.from({ length: PLATE_CONFIG.slotCount }, (_, index) => {
          const slot = index + 1;
          const selected = selectedSlot === slot;
          const landed = landedSlot === slot;
          return (
            <path
              key={slot}
              d={wedgePath(index)}
              fill={SLOT_COLORS[index]}
              stroke={
                landed
                  ? "var(--brand-accent)"
                  : selected
                    ? "#fff8f0"
                    : "rgba(255,255,255,0.35)"
              }
              strokeWidth={landed || selected ? 2.5 : 1}
              opacity={locked && !selected && !landed ? 0.75 : 1}
            />
          );
        })}
        <circle cx="100" cy="100" r="26" fill="var(--brand-surface)" />
        <text
          x="100"
          y="104"
          textAnchor="middle"
          className="fill-[var(--brand-accent)] text-[10px] font-semibold"
        >
          GIK
        </text>
      </svg>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: PLATE_CONFIG.slotCount }, (_, index) => {
          const slot = index + 1;
          const selected = selectedSlot === slot;
          const landed = landedSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={locked}
              onClick={() => onSelect?.(slot)}
              aria-pressed={selected}
              className={cn(
                "touch-target rounded-[var(--radius-md)] border px-2 py-2 text-left text-xs transition-[background-color,border-color] duration-[var(--motion-base)]",
                selected
                  ? "border-[var(--brand-accent)] bg-[color-mix(in_oklab,var(--brand-accent)_16%,var(--brand-surface))]"
                  : "border-[var(--brand-border)] bg-[var(--brand-surface)]",
                landed && "ring-2 ring-[var(--brand-accent)]",
                locked && "cursor-not-allowed opacity-70",
              )}
            >
              <span className="font-display font-semibold">#{slot}</span>
              <span className="mt-0.5 block text-[var(--brand-muted)]">
                {slotIcon(slot)} · x{slotMultiplier(slot)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
