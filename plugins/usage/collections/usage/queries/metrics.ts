/** Shared measurement semantics for totals, time series, and group breakdowns. */
import type { UsageMetrics } from "../../../authoring/client/types.ts";
const knownCache = {
  and: [{ field: "inputTokens", gte: 0 }, {
    field: "cachedInputTokens",
    gte: 0,
  }],
} as const;
const sumFields = [
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cachedInputTokens",
  "cacheCreationInputTokens",
  "totalTokens",
] as const;
export const aggregateMetrics = {
  attempts: { op: "count" },
  completed: { op: "count", filter: { field: "status", eq: "completed" } },
  failed: { op: "count", filter: { field: "status", eq: "failed" } },
  cancelled: { op: "count", filter: { field: "status", eq: "cancelled" } },
  deferred: { op: "count", filter: { field: "status", eq: "deferred" } },
  ...Object.fromEntries(
    sumFields.map((field) => [field, { op: "sum" as const, field }]),
  ),
  durationMs: { op: "sum", field: "metrics.durationMs" },
  durationReported: { op: "count", field: "metrics.durationMs" },
  inputReported: { op: "count", field: "inputTokens" },
  cacheReported: { op: "count", filter: knownCache },
  cacheMeasuredInputTokens: {
    op: "sum",
    field: "inputTokens",
    filter: knownCache,
  },
  cacheMeasuredReadTokens: {
    op: "sum",
    field: "cachedInputTokens",
    filter: knownCache,
  },
} as const;
const counts = [
  "attempts",
  "completed",
  "failed",
  "cancelled",
  "deferred",
  "durationReported",
  "inputReported",
  "cacheReported",
] as const;
const sums = [
  ...sumFields,
  "durationMs",
  "cacheMeasuredInputTokens",
  "cacheMeasuredReadTokens",
] as const;
export function metrics(
  rows: readonly Record<string, unknown>[],
): UsageMetrics {
  const result = {} as UsageMetrics;
  for (const key of counts) {
    result[key] = rows.reduce((sum, row) => sum + number(row[key], 0)!, 0);
  }
  for (const key of sums) {
    let sum: number | null = null;
    for (const row of rows) {
      const value = number(row[key], null);
      if (value !== null) sum = (sum ?? 0) + value;
    }
    result[key] = sum;
  }
  result.averageDurationMs =
    result.durationReported && result.durationMs !== null
      ? result.durationMs / result.durationReported
      : null;
  result.cacheReuse =
    result.cacheMeasuredInputTokens && result.cacheMeasuredReadTokens !== null
      ? result.cacheMeasuredReadTokens / result.cacheMeasuredInputTokens
      : null;
  result.cacheCoverage = result.attempts
    ? result.cacheReported / result.attempts
    : null;
  return result;
}
function number(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
