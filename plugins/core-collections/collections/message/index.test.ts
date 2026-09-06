import { assertEquals, assertRejects } from "@std/assert";
import type { CollectionNamedQueryRead } from "../../../../runtime/collections/definition.ts";
import { createTestDatabase } from "../../../../runtime/testing/ominipg.ts";
import { createSqlSession } from "../../../../runtime/events/index.ts";
import { queryCollectionRecords } from "../../../../runtime/collections/query.ts";
import { createResolvedCollectionReader } from "../../../../runtime/collections/resolved-read.ts";
import {
  createContentResolver,
  createMemoryAssetRepository,
} from "../../../../runtime/content/index.ts";
import type { CollectionQuery } from "../../../../runtime/collections/types.ts";
import { messageCollection } from "./index.ts";

Deno.test("Message Collection owns its name", () =>
  assertEquals(messageCollection.name, "message"));

/** Exercise Core's query against the real SQL compiler and content reader. */
async function fixture(
  records: Record<string, unknown>[],
  branch?: Record<string, string>,
) {
  const db = await createTestDatabase({ url: ":memory:" });
  const session = createSqlSession(db);
  const tables = { nodes: "history_nodes", edges: "unused_edges" };
  await session.query(
    `CREATE TABLE history_nodes (id text, namespace text, type text, data jsonb, created_at timestamptz, updated_at timestamptz, content text)`,
  );
  const rows = records.map((record, index) => ({
    namespace: "tenant",
    threadId: "thread",
    senderId: "human",
    content: [],
    metadata: {},
    createdAt: new Date(index * 1_000).toISOString(),
    ...record,
  }));
  await session.query(
    `INSERT INTO history_nodes SELECT r->>'id', r->>'namespace', 'message', r, (r->>'createdAt')::timestamptz, (r->>'createdAt')::timestamptz, '' FROM jsonb_array_elements($1::jsonb) r`,
    [JSON.stringify(rows)],
  );
  const assets = createMemoryAssetRepository();
  const assetReads: string[] = [];
  const resolver = createContentResolver({
    assets,
    authorize: ({ ref }) => {
      assetReads.push(ref.assetId);
      return true;
    },
  });
  const pages: CollectionQuery[] = [];
  const list = createResolvedCollectionReader(
    (query: CollectionQuery) => {
      pages.push(query);
      return queryCollectionRecords(
        session,
        tables,
        messageCollection,
        "tenant",
        query,
      );
    },
    messageCollection,
    "tenant",
    resolver,
  );
  const read: CollectionNamedQueryRead = {
    async get(collection, id) {
      if (collection === "thread") return { id, activeMessageBranch: branch };
      return (await list({ where: { id }, limit: 1 }))[0] ?? null;
    },
    list(_collection, query = {}, options) {
      return list(query, options);
    },
  };
  return {
    assets,
    assetReads,
    pages,
    select: (input: Record<string, unknown> = {}) =>
      messageCollection.queries!.history.select!({
        input: {
          threadId: "thread",
          viewerParticipantIds: ["human"],
          ...input,
        },
        read,
      }),
    async [Symbol.asyncDispose]() {
      await db.close();
    },
  };
}

Deno.test("history filters in PGlite before pagination across thousands of hidden messages", async () => {
  await using f = await fixture(Array.from({ length: 2_010 }, (_, i) => ({
    id: `m${String(i).padStart(4, "0")}`,
    visibility: i % 500 === 0
      ? { kind: "public" }
      : { kind: "participants", participantIds: ["other"] },
  })));
  assertEquals((await f.select({ order: "desc", limit: 2 })).map((r) => r.id), [
    "m2000",
    "m1500",
  ]);
  assertEquals(f.pages.length, 1);
  assertEquals(f.pages[0].limit, 2);
  assertEquals(
    (await f.select({ order: "desc", after: "m1500", limit: 2 })).map((r) =>
      r.id
    ),
    ["m1000", "m0500"],
  );
  assertEquals(
    (await f.select({ order: "desc", after: "m0500", limit: 2 })).map((r) =>
      r.id
    ),
    ["m0000"],
  );
  assertEquals(
    (await f.select({ order: "asc", before: "m1500", limit: 2 })).map((r) =>
      r.id
    ),
    ["m0000", "m0500"],
  );
  await assertRejects(
    () => Promise.resolve(f.select({ after: "m1501" })),
    RangeError,
  );
  await assertRejects(
    () => Promise.resolve(f.select({ after: "missing" })),
    RangeError,
  );
});

Deno.test("history preserves legacy scope, participant and requester visibility and redacts public status", async () => {
  const tool = (id: string, policy: string) => ({
    id,
    content: [{ assetId: "secret" }],
    visibility: { kind: "tool", policy, requesterId: "agent" },
    metadata: {
      toolStatus: "completed",
      toolId: "search",
      toolInvocation: { id: "call", input: "secret" },
      private: "secret",
    },
  });
  await using f = await fixture([
    { id: "legacy" },
    { id: "blank", historyScopeId: " \t\u00a0" },
    { id: "scoped", historyScopeId: "private" },
    { id: "internal", visibility: { kind: "internal" } },
    {
      id: "member",
      visibility: { kind: "participants", participantIds: ["human"] },
    },
    {
      id: "outsider",
      visibility: { kind: "participants", participantIds: ["other"] },
    },
    tool("status", "public_status"),
    tool("private", "requester_only"),
    tool("public", "public"),
    { id: "other-thread", threadId: "other" },
    { id: "other-tenant", namespace: "other" },
  ]);
  const result = await f.select();
  assertEquals(result.map((r) => r.id), [
    "legacy",
    "blank",
    "member",
    "status",
    "public",
  ]);
  const status = result.find((r) => r.id === "status")!;
  assertEquals(status.content, []);
  assertEquals(
    (status.metadata as Record<string, unknown>).toolStatus,
    "completed",
  );
  assertEquals(JSON.stringify(status).includes("secret"), false);
  assertEquals((await f.select({ messageId: "status" }))[0].content, []);
  assertEquals(await f.select({ messageId: "private" }), []);
  assertEquals(await f.select({ messageId: "other-tenant" }), []);
  assertEquals(
    (await f.select({ viewerParticipantIds: ["agent"] })).map((r) => r.id),
    ["legacy", "blank", "status", "private", "public"],
  );
  assertEquals(
    (await f.select({ viewerParticipantIds: [] })).map((r) => r.id),
    ["legacy", "blank", "status", "public"],
  );
  for (
    const after of [
      "scoped",
      "internal",
      "outsider",
      "other-thread",
      "other-tenant",
    ]
  ) {
    await assertRejects(() => Promise.resolve(f.select({ after })), RangeError);
  }
});

Deno.test("history filters active revision branches with timestamp ties and validates cursors in the selected view", async () => {
  const records = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    createdAt: "2026-09-06T00:00:00.123456Z",
  }));
  await using f = await fixture(records, {
    rootMessageId: "b",
    headMessageId: "d",
  });
  assertEquals((await f.select()).map((r) => r.id), ["a", "d", "e"]);
  assertEquals((await f.select({ view: "all" })).map((r) => r.id), [
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
  assertEquals(await f.select({ messageId: "b" }), []);
  await assertRejects(
    () => Promise.resolve(f.select({ after: "c" })),
    RangeError,
  );
  assertEquals((await f.select({ view: "all", after: "c" })).map((r) => r.id), [
    "d",
    "e",
  ]);
});

Deno.test("history retains the 1001 overfetch bound without scanning discarded rows", async () => {
  await using f = await fixture(
    Array.from({ length: 1_006 }, (_, i) => ({ id: `m${i}` })),
  );
  assertEquals((await f.select({ limit: 1001 })).length, 1001);
  assertEquals(f.pages.map((p) => p.limit), [1000, 1]);
});

Deno.test("history resolves only the selected page through runtime content options", async () => {
  const ref = {
    assetId: "body",
    kind: "text",
    role: "body",
    mediaType: "text/plain",
  };
  await using f = await fixture([
    { id: "visible", content: [ref] },
    {
      id: "hidden",
      content: [{ ...ref, assetId: "missing-private" }],
      visibility: { kind: "participants", participantIds: ["other"] },
    },
    { id: "later", content: [{ ...ref, assetId: "missing-later" }] },
  ]);
  // The memory repository's explicit identity keeps the persisted reference unchanged.
  const asset = await f.assets.publish({
    namespace: "tenant",
    id: "body",
    mediaType: "text/plain",
    body: new TextEncoder().encode("Hello"),
  });
  assertEquals(asset.id, "body");
  assertEquals((await f.select({ limit: 1 }))[0].content, [ref]);
  assertEquals(f.assetReads, []);
  assertEquals((await f.select({ limit: 1, content: true }))[0].content, [{
    ...ref,
    value: "Hello",
  }]);
  assertEquals(f.assetReads, ["body"]);
  assertEquals(
    (await f.select({
      messageId: "visible",
      content: { fields: ["content"] },
    }))[0].content,
    [{ ...ref, value: "Hello" }],
  );
  assertEquals(await f.select({ messageId: "hidden", content: true }), []);
  await assertRejects(
    () =>
      Promise.resolve(
        f.select({ limit: 1, content: { fields: ["metadata"] } }),
      ),
    TypeError,
    "Undeclared content field",
  );
});
