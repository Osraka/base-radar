"use client";

import { CATEGORY_OPTIONS } from "@/lib/constants";
import type { AppCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  value: AppCategory | "All";
  onChange: (value: AppCategory | "All") => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div
      className="scrollbar-thin flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.025] p-1"
      role="tablist"
      aria-label="Kategori filtresi"
    >
      {CATEGORY_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            "h-9 shrink-0 rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:text-white",
            value === option && "bg-primary text-white shadow-glow"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
