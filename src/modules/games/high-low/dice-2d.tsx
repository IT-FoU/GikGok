"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/modules/localization/provider";

export function NumberDie({
  value,
  size = "md",
  highlighted = false,
  spinning = false,
  triple = false,
}: {
  value: number | null;
  size?: "sm" | "md" | "lg";
  highlighted?: boolean;
  spinning?: boolean;
  triple?: boolean;
}) {
  const sizeClass =
    size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-14 w-14 text-lg";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[var(--radius-lg)] border-2 font-display font-semibold transition-[transform,opacity] duration-[var(--motion-base)]",
        sizeClass,
        highlighted && "scale-105 shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-accent)_40%,transparent)]",
        spinning && "animate-pulse",
        triple
          ? "border-[var(--status-danger)] bg-[color-mix(in_oklab,var(--status-danger)_18%,var(--brand-surface))]"
          : "border-[var(--brand-border)] bg-[linear-gradient(160deg,#f4efe6,#d9cbb8)] text-[#2a2118]",
      )}
      role="img"
      aria-label={value == null ? "…" : String(value)}
    >
      {value ?? "?"}
    </div>
  );
}

export function DiceReveal2D({
  dice,
  total,
  isTriple,
  revealing,
}: {
  dice: [number, number, number] | null;
  total?: number | null;
  isTriple?: boolean;
  revealing?: boolean;
}) {
  const t = useTranslations();
  const faces = dice ?? [null, null, null];

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--brand-muted)]">{t("highlow.result.dice")}</p>
      <div className="flex flex-wrap justify-center gap-4">
        {faces.map((face, index) => (
          <NumberDie
            key={`die-${index}`}
            value={face}
            size="lg"
            spinning={Boolean(revealing && !dice)}
            highlighted={Boolean(dice)}
            triple={Boolean(isTriple && dice)}
          />
        ))}
      </div>
      {dice ? (
        <div className="text-center text-sm">
          <p>
            {t("highlow.result.total")}:{" "}
            <span className="font-display text-lg font-semibold">
              {total ?? dice[0] + dice[1] + dice[2]}
            </span>
          </p>
          {isTriple ? (
            <p className="mt-1 text-[var(--status-danger)]">
              {t("highlow.result.triple")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SidePicker({
  side,
  disabled,
  onChange,
}: {
  side: "high" | "low";
  disabled?: boolean;
  onChange: (side: "high" | "low") => void;
}) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("highlow.side")}>
      {(["low", "high"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          aria-pressed={side === option}
          className={cn(
            "touch-target rounded-[var(--radius-xl)] border-2 px-4 py-6 text-left transition-[background-color,border-color,transform] duration-[var(--motion-base)]",
            side === option
              ? "border-[var(--brand-accent)] bg-[color-mix(in_oklab,var(--brand-accent)_14%,var(--brand-surface))]"
              : "border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-elevated)]",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <p className="font-display text-xl font-semibold">
            {option === "low" ? t("highlow.sideLow") : t("highlow.sideHigh")}
          </p>
          <p className="mt-1 text-sm text-[var(--brand-muted)]">
            {option === "low" ? t("highlow.sideLowHelp") : t("highlow.sideHighHelp")}
          </p>
        </button>
      ))}
    </div>
  );
}
