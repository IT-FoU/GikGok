"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FilterBar({
  search,
  onSearchChange,
  searchLabel = "Search",
  filterLabel = "Filter",
  filterValue,
  onFilterChange,
  filterOptions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  filterLabel?: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <div className="space-y-2">
        <Label htmlFor="filter-search">{searchLabel}</Label>
        <Input
          id="filter-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchLabel}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="filter-select">{filterLabel}</Label>
        <select
          id="filter-select"
          value={filterValue}
          onChange={(event) => onFilterChange(event.target.value)}
          className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
