/** Validate the bounded semantic analytics selection before database work. */
import type { CollectionPredicate } from "@copilotz/copilotz/collections";
import type {
  UsageFilters,
  UsageGroup,
  UsageInterval,
} from "../../../authoring/client/types.ts";
const GROUPS = new Set([
  "provider",
  "model",
  "connection",
  "resource",
  "agentId",
  "threadId",
]);
const FILTERS = [
  "provider",
  "model",
  "connection",
  "resource",
  "agentId",
  "threadId",
  "status",
] as const;
export function selection(input: Record<string, unknown>) {
  const kind = input.kind ?? "llm";
  if (kind !== "llm" && kind !== "tool") {
    throw new TypeError("Usage kind must be llm or tool.");
  }
  const date = (value: unknown, name: string): string => {
    if (
      typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
      !Number.isFinite(Date.parse(value))
    ) {
      throw new TypeError(`${name} must be an ISO timestamp.`);
    }
    return new Date(value).toISOString();
  };
  const to = date(input.to ?? new Date().toISOString(), "to");
  const from = date(
    input.from ?? new Date(Date.parse(to) - 7 * 86400000).toISOString(),
    "from",
  );
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > 366 * 86400000) {
    throw new RangeError(
      "Usage ranges must be positive and no longer than 366 days.",
    );
  }
  const interval = input.interval ?? "day";
  if (!["hour", "day", "week"].includes(String(interval))) {
    throw new TypeError("Invalid usage interval.");
  }
  if (interval === "hour" && span > 31 * 86400000) {
    throw new RangeError("Hourly usage is limited to 31 days.");
  }
  const rawGroup = input.groupBy ??
    (kind === "llm" ? ["provider", "model"] : ["resource"]);
  const groupBy = typeof rawGroup === "string" ? rawGroup.split(",") : rawGroup;
  if (
    !Array.isArray(groupBy) || groupBy.length < 1 || groupBy.length > 2 ||
    new Set(groupBy).size !== groupBy.length ||
    groupBy.some((g) => typeof g !== "string" || !GROUPS.has(g))
  ) {
    throw new TypeError(
      "Usage grouping requires one or two supported dimensions.",
    );
  }
  const filters: UsageFilters = { kind, from, to };
  const and: CollectionPredicate[] = [
    { field: "kind", eq: kind },
    { field: "occurredAt", gte: from },
    { field: "occurredAt", lt: to },
  ];
  for (const key of FILTERS) {
    const value = input[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > 1024) {
      throw new TypeError(`Invalid ${key} filter.`);
    }
    filters[key] = value;
    and.push({ field: key, eq: value });
  }
  // Authority is supplied by the scoped collection, never by these selections.
  for (const key of ["namespace", "databaseSchema", "schema"]) {
    if (input[key] !== undefined) {
      throw new TypeError("Usage filters cannot select persistence scope.");
    }
  }
  return {
    filters,
    groupBy: groupBy as UsageGroup[],
    interval: interval as UsageInterval,
    filter: { and } as CollectionPredicate,
  };
}
