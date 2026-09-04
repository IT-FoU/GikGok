import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse-soft rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--brand-muted)_25%,transparent)]",
        className,
      )}
      aria-hidden
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-[var(--brand-muted)]"
      role="status"
      aria-live="polite"
    >
      <Skeleton className="h-10 w-10 rounded-full" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      className="surface flex min-h-40 flex-col items-start justify-center gap-3 p-5"
      role="alert"
    >
      <h2 className="font-display text-lg font-semibold text-[var(--status-danger)]">
        {title}
      </h2>
      {description ? (
        <p className="text-sm text-[var(--brand-muted)]">{description}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          className="touch-target rounded-[var(--radius-lg)] border border-[var(--brand-border)] px-4 text-sm"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="surface flex min-h-32 flex-col items-start justify-center gap-2 p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="text-sm text-[var(--brand-muted)]">{description}</p>
      ) : null}
    </div>
  );
}
