"use client";

import { cn } from "@/lib/utils";
import type { FpcSymbol } from "@/modules/game-engine";
import { useTranslations } from "@/modules/localization/provider";

import { FPC_SYMBOL_META } from "./config";

export function SymbolDie({
  symbol,
  size = "md",
  highlighted = false,
  dimmed = false,
  spinning = false,
  label,
}: {
  symbol: FpcSymbol | null;
  size?: "sm" | "md" | "lg";
  highlighted?: boolean;
  dimmed?: boolean;
  spinning?: boolean;
  label?: string;
}) {
  const t = useTranslations();
  const meta = symbol ? FPC_SYMBOL_META[symbol] : null;
  const sizeClass =
    size === "lg" ? "h-24 w-24 text-lg" : size === "sm" ? "h-12 w-12 text-xs" : "h-16 w-16 text-sm";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 font-display font-semibold transition-[transform,box-shadow,opacity] duration-[var(--motion-base)]",
        sizeClass,
        highlighted && "scale-105 shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-accent)_45%,transparent)]",
        dimmed && "opacity-45",
        spinning && "animate-pulse",
      )}
      style={{
        background: meta
          ? `linear-gradient(145deg, ${meta.color}, color-mix(in oklab, ${meta.color} 55%, black))`
          : "var(--brand-surface)",
        borderColor: meta
          ? "color-mix(in oklab, white 35%, transparent)"
          : "var(--brand-border)",
        color: "#fff8f0",
      }}
      aria-label={
        label ??
        (symbol ? t(meta!.labelKey) : t("fpc.dice.waiting"))
      }
      role="img"
    >
      <span className="tracking-wide">{meta?.glyph ?? "?"}</span>
      {symbol ? (
        <span className="mt-0.5 text-[0.65rem] font-sans font-medium opacity-90">
          {t(meta!.labelKey)}
        </span>
      ) : null}
    </div>
  );
}

export function SymbolPicker({
  selected,
  disabled,
  multi,
  onToggle,
}: {
  selected: FpcSymbol[];
  disabled?: boolean;
  multi?: boolean;
  onToggle: (symbol: FpcSymbol) => void;
}) {
  const t = useTranslations();
  const symbols = Object.keys(FPC_SYMBOL_META) as FpcSymbol[];

  return (
    <div
      className="grid grid-cols-3 gap-3 sm:grid-cols-6"
      role="group"
      aria-label={t("fpc.selectSymbols")}
    >
      {symbols.map((symbol) => {
        const active = selected.includes(symbol);
        return (
          <button
            key={symbol}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(symbol)}
            className={cn(
              "touch-target flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              disabled && "cursor-not-allowed",
            )}
            aria-pressed={active}
          >
            <SymbolDie
              symbol={symbol}
              size="md"
              highlighted={active}
              dimmed={!active && selected.length > 0 && !multi}
            />
          </button>
        );
      })}
    </div>
  );
}

export function DiceReveal2D({
  dice,
  revealing,
}: {
  dice: [FpcSymbol, FpcSymbol, FpcSymbol] | null;
  revealing?: boolean;
}) {
  const t = useTranslations();
  const faces = dice ?? [null, null, null];

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--brand-muted)]">{t("fpc.result.dice")}</p>
      <div className="flex flex-wrap justify-center gap-4">
        {faces.map((face, index) => (
          <SymbolDie
            key={`die-${index}`}
            symbol={face}
            size="lg"
            spinning={Boolean(revealing && !dice)}
            highlighted={Boolean(dice)}
          />
        ))}
      </div>
    </div>
  );
}
