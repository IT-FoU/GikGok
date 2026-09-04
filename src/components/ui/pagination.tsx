"use client";

import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
}) {
  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {previousLabel}
      </Button>
      <p className="text-sm text-[var(--brand-muted)]">
        {page} / {Math.max(pageCount, 1)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}
