/** Usage analytics reduce database aggregates, never individual ledger records. */
import type { CollectionNamedQuery } from "@copilotz/copilotz/collections";
import type {
  UsageAnalytics,
  UsageBreakdown,
} from "../../../authoring/client/types.ts";
import { selection } from "./request.ts";
import { aggregateMetrics, metrics } from "./metrics.ts";
export const analyticsQuery: CollectionNamedQuery = {
  async select({ input, read }) {
    const { filters, groupBy, interval, filter } = selection(input);
    // One SQL statement supplies one consistent snapshot to all three views.
    const rows = await read.aggregate("usage", {
      filter,
      groupBy: [{ field: "occurredAt", interval }, ...groupBy],
      metrics: aggregateMetrics,
      limit: 10000,
    });
    const byBucket = new Map<string, Record<string, unknown>[]>();
    const byGroup = new Map<
      string,
      {
        dimensions: Record<string, string | null>;
        rows: Record<string, unknown>[];
      }
    >();
    for (const row of rows) {
      const bucket = String(row.bucket);
      const bucketRows = byBucket.get(bucket) ?? [];
      bucketRows.push(row);
      byBucket.set(bucket, bucketRows);
      const dimensions = Object.fromEntries(
        groupBy.map(
          (field) => [
            field,
            typeof row[field] === "string" ? row[field] as string : null,
          ],
        ),
      );
      const key = JSON.stringify(groupBy.map((field) => dimensions[field]));
      const group = byGroup.get(key) ?? { dimensions, rows: [] };
      group.rows.push(row);
      byGroup.set(key, group);
    }
    const breakdown: UsageBreakdown[] = [...byGroup].map(([key, group]) => ({
      key,
      dimensions: group.dimensions,
      ...metrics(group.rows),
    }));
    breakdown.sort((a, b) =>
      (b.inputTokens ?? b.attempts) - (a.inputTokens ?? a.attempts) ||
      a.key.localeCompare(b.key)
    );
    const result: UsageAnalytics = {
      summary: metrics(rows),
      series: [...byBucket].sort(([a], [b]) => a.localeCompare(b)).map((
        [bucket, values],
      ) => ({ bucket, ...metrics(values) })),
      breakdown,
      filters,
      groupBy,
      interval,
      generatedAt: new Date().toISOString(),
      timezone: "UTC",
    };
    return [result as unknown as Record<string, unknown>];
  },
};
