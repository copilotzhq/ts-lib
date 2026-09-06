/** Defines the canonical Core Message Collection. @module */

import { contentSequenceSchema } from "@copilotz/copilotz/content";
import {
  type CollectionContentOptions,
  type CollectionDefinition,
  type CollectionPredicate,
  defineCollection,
  relation,
} from "@copilotz/copilotz/collections";
import { metadataSchema, timestampsSchema } from "../internal/schema.ts";
import type {
  MessageBranch,
  MessageRevision,
} from "../../internal/contracts.ts";

export type {
  MessageBranch,
  MessageRevision,
} from "../../internal/contracts.ts";
export { projectActiveMessageBranch } from "../../internal/projections.ts";

export type MessageRecord = Readonly<{
  id: string;
  revision?: MessageRevision;
}>;

type HistoryMessageRecord =
  & MessageRecord
  & Readonly<Record<string, unknown>>;

type MessageOrderKey = Readonly<{ createdAt: string; id: string }>;

function messageOrderKey(record: HistoryMessageRecord): MessageOrderKey {
  return Object.freeze({
    createdAt: String(record.createdAt ?? ""),
    id: record.id,
  });
}

function compareMessageOrder(
  left: MessageOrderKey,
  right: MessageOrderKey,
): number {
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  return createdAt || left.id.localeCompare(right.id);
}

/** Selection runs in storage, before pagination and optional content reads. */
function publicHistoryFilter(viewers?: readonly string[]): CollectionPredicate {
  return {
    and: [
      {
        or: [
          { field: "historyScopeId", exists: false },
          { field: "historyScopeId", isNull: true },
          { field: "historyScopeId", isBlank: true },
        ],
      },
      { field: "visibility.kind", ne: "internal" },
      ...(viewers === undefined ? [] : [
        {
          or: [
            { field: "visibility.kind", exists: false },
            { field: "visibility.kind", eq: "public" },
            {
              and: [
                { field: "visibility.kind", eq: "tool" },
                {
                  or: [
                    {
                      field: "visibility.policy",
                      in: ["public", "public_status"],
                    },
                    { field: "visibility.requesterId", in: viewers },
                  ],
                },
              ],
            },
            {
              and: [
                { field: "visibility.kind", eq: "participants" },
                { field: "visibility.participantIds", overlaps: viewers },
              ],
            },
          ],
        } satisfies CollectionPredicate,
      ]),
    ],
  };
}

function orderBoundary(
  key: MessageOrderKey,
  direction: "lt" | "gt",
): CollectionPredicate {
  return {
    or: [
      { field: "createdAt", [direction]: key.createdAt } as CollectionPredicate,
      {
        and: [
          { field: "createdAt", eq: key.createdAt },
          { field: "id", [direction]: key.id } as CollectionPredicate,
        ],
      },
    ],
  };
}

/** Public tool status never grants access to a result body or execution metadata. */
function projectHistoryRecord(
  record: HistoryMessageRecord,
  viewers?: readonly string[],
): HistoryMessageRecord {
  const visibility = record.visibility as Record<string, unknown> | undefined;
  if (
    !viewers || visibility?.kind !== "tool" ||
    visibility.policy !== "public_status" ||
    viewers.includes(String(visibility.requesterId))
  ) return record;
  const metadata = record.metadata as Record<string, unknown>;
  const invocation = metadata.toolInvocation as
    | Record<string, unknown>
    | undefined;
  const workflow = metadata.copilotzWorkflow as
    | Record<string, unknown>
    | undefined;
  const action = metadata.copilotzToolAction as
    | Record<string, unknown>
    | undefined;
  return {
    ...record,
    content: [],
    metadata: {
      toolStatus: metadata.toolStatus,
      toolId: metadata.toolId,
      toolInvocation: { id: invocation?.id, tool: { id: metadata.toolId } },
      copilotzWorkflow: { sourceMessageId: workflow?.sourceMessageId },
      copilotzToolAction: {
        actionRunId: action?.actionRunId,
        planMessageId: action?.planMessageId,
      },
    },
  };
}

type ActiveBranchWindow = Readonly<{
  root: MessageOrderKey;
  head: MessageOrderKey;
  headMessageId: string;
}>;

async function activeBranchWindow(
  read: Parameters<
    NonNullable<
      NonNullable<typeof messageCollection.queries>[string]["select"]
    >
  >[0]["read"],
  threadId: string,
  branch: MessageBranch | undefined,
): Promise<ActiveBranchWindow | undefined> {
  if (!branch) return undefined;
  const [root, head] = await Promise.all([
    read.get("message", branch.rootMessageId),
    read.get("message", branch.headMessageId),
  ]) as readonly (HistoryMessageRecord | null)[];
  if (
    !root || !head || root.threadId !== threadId || head.threadId !== threadId
  ) return undefined;
  const rootKey = messageOrderKey(root);
  const headKey = messageOrderKey(head);
  if (compareMessageOrder(rootKey, headKey) >= 0) return undefined;
  return Object.freeze({
    root: rootKey,
    head: headKey,
    headMessageId: head.id,
  });
}

/** Builds revision fields for a new `message.created` row. */
export function messageRevisionFrom(
  previous: MessageRecord,
  revisedAt: string,
): MessageRevision {
  return Object.freeze({
    rootMessageId: previous.revision?.rootMessageId ?? previous.id,
    previousRevisionMessageId: previous.id,
    revisionIndex: (previous.revision?.revisionIndex ?? 0) + 1,
    revisedAt,
  });
}

export const messageCollection: CollectionDefinition = defineCollection({
  name: "message",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      namespace: { type: "string" },
      threadId: { type: "string" },
      senderId: { type: "string" },
      recipientIds: {
        type: "array",
        items: { type: "string" },
      },
      content: contentSequenceSchema,
      metadata: metadataSchema,
      visibility: { type: "object" },
      historyScopeId: { type: "string" },
      revision: {
        type: "object",
        additionalProperties: false,
        properties: {
          rootMessageId: { type: "string" },
          previousRevisionMessageId: { type: "string" },
          revisionIndex: { type: "integer" },
          revisedAt: { type: "string" },
        },
        required: [
          "rootMessageId",
          "previousRevisionMessageId",
          "revisionIndex",
          "revisedAt",
        ],
      },
      ...timestampsSchema,
    },
    required: [
      "id",
      "namespace",
      "threadId",
      "senderId",
      "recipientIds",
      "content",
      "metadata",
      "createdAt",
      "updatedAt",
    ],
  } as const,
  defaults: {
    recipientIds: [],
    content: [],
    metadata: {},
  },
  content: { fields: ["content", "metadata.llmReasoning"] },
  relations: {
    thread: relation.belongsTo("thread", "threadId", "has_message"),
    sender: relation.belongsTo("participant", "senderId", "sent_by"),
  },
  queries: {
    byThreadId: {
      filter({ input }) {
        return { threadId: String(input.threadId ?? "") };
      },
    },
    revisions: {
      filter({ input }) {
        return {
          "revision.rootMessageId": String(input.rootMessageId ?? ""),
        };
      },
    },
    history: {
      inputSchema: {
        type: "object",
        properties: {
          overfetch: { type: "boolean" },
          content: {
            anyOf: [
              { type: "boolean" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  fields: { type: "array", items: { type: "string" } },
                  byteLimit: { type: "integer", minimum: 0 },
                },
              },
            ],
          },
        },
      },
      async select({ input, read }) {
        const threadId = String(input.threadId ?? "").trim();
        if (!threadId) throw new TypeError("Thread ID must be non-empty.");
        const after = typeof input.after === "string" && input.after.trim()
          ? input.after.trim()
          : undefined;
        const before = typeof input.before === "string" && input.before.trim()
          ? input.before.trim()
          : undefined;
        if (after && before) {
          throw new TypeError(
            "Message history accepts either after or before, not both.",
          );
        }
        const order = input.order === "desc" ? "desc" : "asc";
        const thread = await read.get("thread", threadId);
        const branch = input.view === "all"
          ? undefined
          : await activeBranchWindow(
            read,
            threadId,
            thread?.activeMessageBranch as MessageBranch | undefined,
          );
        // HTTP callers supply trusted viewer identities, never client query authority.
        const viewers = Array.isArray(input.viewerParticipantIds)
          ? input.viewerParticipantIds.filter((id): id is string =>
            typeof id === "string"
          )
          : undefined;
        const filter: CollectionPredicate = {
          and: [
            publicHistoryFilter(viewers),
            ...(branch
              ? [
                {
                  or: [
                    orderBoundary(branch.root, "lt"),
                    { field: "id", eq: branch.headMessageId },
                    orderBoundary(branch.head, "gt"),
                  ],
                } satisfies CollectionPredicate,
              ]
              : []),
          ],
        };
        // Select and redact first. Only unchanged, fully visible records may be
        // re-read with content; status-only records never enter that read.
        const finish = async (
          records: readonly HistoryMessageRecord[],
          contentLimit = records.length,
        ) => {
          const projected = records.map((record) =>
            projectHistoryRecord(record, viewers)
          );
          if (!input.content) return projected;
          const visible = records.filter((record, index) =>
            index < contentLimit && projected[index] === record
          );
          const resolved = new Map<string, HistoryMessageRecord>();
          for (let offset = 0; offset < visible.length; offset += 512) {
            const batch = visible.slice(offset, offset + 512);
            const values = await read.list("message", {
              where: { threadId },
              filter: {
                and: [
                  filter,
                  ...(viewers
                    ? [{
                      not: {
                        and: [
                          { field: "visibility.kind", eq: "tool" },
                          { field: "visibility.policy", eq: "public_status" },
                          {
                            not: {
                              field: "visibility.requesterId",
                              in: viewers,
                            },
                          },
                        ],
                      },
                    }]
                    : []),
                  { field: "id", in: batch.map((record) => record.id) },
                ],
              },
              limit: batch.length,
            }, {
              content: input.content as CollectionContentOptions,
            }) as readonly HistoryMessageRecord[];
            const versions = new Map(
              batch.map((record) => [record.id, record.updatedAt]),
            );
            for (const value of values) {
              if (versions.get(value.id) !== value.updatedAt) {
                throw new Error(
                  "Message history changed during content preparation.",
                );
              }
              resolved.set(value.id, value);
            }
            if (values.length !== batch.length) {
              throw new Error(
                "Message history changed during content preparation.",
              );
            }
          }
          return projected.map((record) => resolved.get(record.id) ?? record);
        };
        // Exact reads use the same database predicate as pages and cursor validation.
        if (typeof input.messageId === "string") {
          const records = await read.list("message", {
            where: { threadId, id: input.messageId },
            filter,
            limit: 1,
          }) as readonly HistoryMessageRecord[];
          return await finish(records);
        }
        const limit = Number(input.limit ?? 100);
        if (!Number.isSafeInteger(limit) || limit <= 0) {
          throw new TypeError(
            "Message history limit must be a positive integer.",
          );
        }
        // Event-native overfetches one record for exact pageInfo.hasMore.
        const selectedLimit = Math.min(
          limit + (input.overfetch === true ? 1 : 0),
          1_001,
        );
        const selected: HistoryMessageRecord[] = [];

        // Collection cursors already follow the requested sort direction.
        let scanAfter = after;
        while (selected.length < selectedLimit) {
          const batchLimit = Math.min(1_000, selectedLimit - selected.length);
          const page = await read.list("message", {
            where: { threadId },
            filter,
            order: { field: "createdAt", direction: order },
            ...(scanAfter ? { after: scanAfter } : {}),
            ...(before ? { before } : {}),
            limit: batchLimit,
          }) as readonly HistoryMessageRecord[];
          selected.push(...page);
          if (page.length < batchLimit) break;
          const next = page.at(-1)?.id;
          if (!next || next === scanAfter) break;
          scanAfter = next;
        }
        return Object.freeze(await finish(selected, limit));
      },
    },
  },
});
