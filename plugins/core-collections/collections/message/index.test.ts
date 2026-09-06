import { assert, assertEquals } from "@std/assert";
import type { CollectionNamedQueryRead } from "../../../../runtime/collections/definition.ts";
import type { CollectionQuery } from "../../../../runtime/collections/types.ts";
import { messageCollection } from "./index.ts";
Deno.test("Message Collection owns its name", () =>
  assertEquals(messageCollection.name, "message"));

Deno.test("Message history pages the true newest records beyond one thousand", async () => {
  const records = Array.from({ length: 1_006 }, (_, offset) => {
    const rank = offset + 1;
    return Object.freeze({
      id: `message-${String(rank).padStart(4, "0")}`,
      namespace: "tenant-a",
      threadId: "thread-a",
      senderId: "human-a",
      recipientIds: [],
      content: [],
      metadata: {},
      createdAt: new Date(rank * 1_000).toISOString(),
      updatedAt: new Date(rank * 1_000).toISOString(),
    });
  });
  const byId = new Map<string, (typeof records)[number]>(
    records.map((record) => [record.id, record]),
  );
  const read: CollectionNamedQueryRead = Object.freeze({
    get(collection: string, id: string) {
      if (collection === "thread") {
        return Promise.resolve(id === "thread-a" ? { id } : null);
      }
      return Promise.resolve(
        collection === "message" ? byId.get(id) ?? null : null,
      );
    },
    list(_collection: string, query: CollectionQuery = {}) {
      const direction = query.order?.direction === "desc" ? "desc" : "asc";
      let ordered = [...records].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
      );
      if (direction === "desc") ordered.reverse();
      const after = query.after
        ? ordered.findIndex((record) => record.id === query.after)
        : -1;
      if (after >= 0) ordered = ordered.slice(after + 1);
      if (query.before) {
        const before = ordered.findIndex((record) =>
          record.id === query.before
        );
        if (before >= 0) ordered = ordered.slice(0, before);
      }
      return Promise.resolve(ordered.slice(0, query.limit));
    },
  });
  const select = messageCollection.queries?.history?.select;
  assert(select);
  const newest = await select({
    input: { threadId: "thread-a", order: "desc", limit: 7 },
    read,
  });
  assertEquals(newest.map((record) => record.id), [
    "message-1006",
    "message-1005",
    "message-1004",
    "message-1003",
    "message-1002",
    "message-1001",
    "message-1000",
  ]);
  const older = await select({
    input: {
      threadId: "thread-a",
      order: "desc",
      before: "message-1000",
      limit: 2,
    },
    read,
  });
  assertEquals(older.map((record) => record.id), [
    "message-0999",
    "message-0998",
  ]);
});

Deno.test("browser history projects tool status without exposing private results", async () => {
  const make = (id: string, policy: string) => ({
    id,
    threadId: "thread",
    senderId: "tool",
    content: [{ assetId: "secret" }],
    visibility: { kind: "tool", policy, requesterId: "agent" },
    metadata: {
      toolStatus: "completed",
      toolId: "search",
      toolInvocation: { id: "call", tool: { id: "search" }, input: "secret" },
      copilotzWorkflow: { sourceMessageId: "plan", private: "secret" },
      copilotzToolAction: {
        actionRunId: "run",
        planMessageId: "plan",
        input: "secret",
      },
      private: "secret",
    },
  });
  const records = [
    make("status", "public_status"),
    make("private", "requester_only"),
    make("public", "public"),
  ];
  const read: CollectionNamedQueryRead = {
    get(collection, id) {
      return Promise.resolve(
        collection === "thread"
          ? { id }
          : records.find((r) => r.id === id) ?? null,
      );
    },
    list() {
      return Promise.resolve(records);
    },
  };
  const select = messageCollection.queries!.history.select!;
  const input = { threadId: "thread", viewerParticipantIds: ["human"] };
  const result = await select({ input, read });
  assertEquals(result.map((r) => r.id), ["status", "public"]);
  assertEquals(result[0].content, []);
  assertEquals(
    (result[0].metadata as Record<string, unknown>).toolStatus,
    "completed",
  );
  assertEquals(JSON.stringify(result[0]).includes("secret"), false);
  assertEquals(
    (await select({ input: { ...input, messageId: "status" }, read }))[0]
      .content,
    [],
  );
  assertEquals(
    await select({ input: { ...input, messageId: "private" }, read }),
    [],
  );
  const requester = await select({
    input: { ...input, viewerParticipantIds: ["agent"] },
    read,
  });
  assertEquals(requester.length, 3);
  assertEquals(requester[0].content, records[0].content);
});
