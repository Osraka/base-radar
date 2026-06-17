import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { MetricCoverage } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    ...options
  }).format(value);
}

function formatCompactStable(value: number) {
  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const units = [
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" }
  ];

  const unitIndex = units.findIndex((unit) => absoluteValue >= unit.value);

  if (unitIndex === -1) {
    return `${sign}${formatNumber(absoluteValue)}`;
  }

  const unit = units[unitIndex];
  const scaled = absoluteValue / unit.value;
  const decimals = scaled >= 100 ? 0 : 1;
  const rounded = Number(scaled.toFixed(decimals));

  if (rounded >= 1000 && unitIndex > 0) {
    const nextUnit = units[unitIndex - 1];
    return `${sign}${(absoluteValue / nextUnit.value)
      .toFixed(1)
      .replace(/\.0$/, "")}${nextUnit.suffix}`;
  }

  return `${sign}${rounded.toFixed(decimals).replace(/\.0$/, "")}${unit.suffix}`;
}

export function formatCompact(value: number) {
  return formatCompactStable(value);
}

export function formatCurrency(value: number) {
  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 100000) {
    return `${sign}$${formatCompactStable(absoluteValue)}`;
  }

  return `${sign}$${formatNumber(absoluteValue)}`;
}

export function isMetricUnavailable(value: number, coverage?: MetricCoverage) {
  return value <= 0 && (coverage === "limited" || coverage === "experimental");
}

export function formatMetricCompact(value: number, coverage?: MetricCoverage) {
  return isMetricUnavailable(value, coverage) ? "Unavailable" : formatCompact(value);
}

export function formatMetricCurrency(value: number, coverage?: MetricCoverage) {
  return isMetricUnavailable(value, coverage) ? "Unavailable" : formatCurrency(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function relativeTime(isoDate: string) {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.round(diffHours / 24)}d ago`;
}
