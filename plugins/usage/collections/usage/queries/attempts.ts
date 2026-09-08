/** Bounded record drill-down uses the same selection as analytics. */
import type { CollectionNamedQuery } from "@copilotz/copilotz/collections";
import type {
  UsageAttempt,
  UsageAttemptPage,
} from "../../../authoring/client/types.ts";
import { selection } from "./request.ts";
export const attemptsQuery: CollectionNamedQuery = {
  async select({ input, read }) {
    const { filter } = selection(input);
    const limit = input.limit === undefined ? 50 : Number(input.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new RangeError("Attempt limit must be 1 to 200.");
    }
    if (input.after !== undefined && typeof input.after !== "string") {
      throw new TypeError("Invalid attempt cursor.");
    }
    const rows = await read.list("usage", {
      filter,
      limit: limit + 1,
      order: { field: "createdAt", direction: "desc" },
      ...(input.after ? { after: String(input.after) } : {}),
    });
    const items: UsageAttempt[] = rows.slice(0, limit).map((row) => {
      const text = (key: string) =>
        typeof row[key] === "string" ? row[key] as string : null;
      const number = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
      return {
        id: String(row.id),
        kind: String(row.kind),
        provider: text("provider"),
        model: text("model"),
        connection: text("connection"),
        resource: text("resource"),
        agentId: text("agentId"),
        threadId: text("threadId"),
        status: text("status"),
        occurredAt: String(row.occurredAt ?? row.createdAt),
        inputTokens: number(row.inputTokens),
        outputTokens: number(row.outputTokens),
        cachedInputTokens: number(row.cachedInputTokens),
        durationMs: number(
          (row.metrics as Record<string, unknown> | null)?.durationMs,
        ),
      };
    });
    const result: UsageAttemptPage = {
      items,
      pageInfo: {
        hasMore: rows.length > limit,
        next: rows.length > limit ? items.at(-1)!.id : null,
      },
    };
    return [result as unknown as Record<string, unknown>];
  },
};
