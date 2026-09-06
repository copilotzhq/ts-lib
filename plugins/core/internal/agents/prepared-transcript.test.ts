import { assertEquals } from "@std/assert";
import { createTestDatabase } from "../../../../runtime/testing/ominipg.ts";
import { createSqlSession } from "../../../../runtime/events/index.ts";
import { queryCollectionRecords } from "../../../../runtime/collections/query.ts";
import { createResolvedCollectionReader } from "../../../../runtime/collections/resolved-read.ts";
import {
  createContentResolver,
  createMemoryAssetRepository,
} from "../../../../runtime/content/index.ts";
import type {
  CollectionQuery,
  CollectionRecord,
  ScopedCollection,
} from "../../../../runtime/collections/index.ts";
import { messageCollection } from "../../../core-collections/collections/message/index.ts";
import {
  mapMessageRecord,
  threadMessageRecordInWindow,
  threadMessageWindowFilter,
} from "../../../core-collections/internal/projections.ts";
import type { Participant } from "../../../core-collections/internal/contracts.ts";
import type { CoreProcessorContext } from "../runtime-context.ts";
import { prepareLlmTranscript } from "./prepared-transcript.ts";

const date = "2026-09-06T00:00:00.000Z";
Deno.test("Core resolves final transcript content and own reasoning, leaving peer reasoning and attachment bodies unread", async () => {
  const db = await createTestDatabase({ url: ":memory:" });
  const session = createSqlSession(db);
  const assets = createMemoryAssetRepository();
  const readIds: string[] = [];
  const resolver = createContentResolver({
    assets,
    authorize: ({ ref }) => {
      readIds.push(ref.assetId);
      return true;
    },
  });
  const publish = async (id: string, text: string) => {
    await assets.publish({
      namespace: "tenant",
      id,
      mediaType: "text/plain",
      body: new TextEncoder().encode(text),
    });
    return {
      assetId: id,
      kind: "text" as const,
      role: "body",
      mediaType: "text/plain",
    };
  };
  try {
    const body = await publish("body", "visible");
    const reasoning = await publish("reasoning", "own previous thought");
    const missing = { ...body, assetId: "must-not-read" };
    const records = [
      {
        id: "north-message",
        senderId: "north",
        content: [body],
        metadata: { llmReasoning: [reasoning] },
      },
      {
        id: "east-message",
        senderId: "east",
        content: [body],
        metadata: { llmReasoning: [missing] },
      },
      {
        id: "private-tool",
        senderId: "tool",
        content: [missing],
        metadata: {
          historyVisibility: "requester_only",
          requesterId: "east",
          toolInvocation: { id: "call" },
        },
      },
      {
        id: "human-message",
        senderId: "human",
        content: [body, { ...missing, disposition: "attachment" }],
        metadata: {},
      },
    ].map((record) => ({
      ...record,
      namespace: "tenant",
      threadId: "thread",
      createdAt: date,
      updatedAt: date,
    })) as CollectionRecord[];
    await session.query(
      "CREATE TABLE transcript_nodes (id text,namespace text,type text,data jsonb,created_at timestamptz,updated_at timestamptz,content text)",
    );
    await session.query(
      "INSERT INTO transcript_nodes SELECT r->>'id','tenant','message',r,$2::timestamptz,$2::timestamptz,'' FROM jsonb_array_elements($1::jsonb) r",
      [JSON.stringify(records), date],
    );
    const queries: CollectionQuery[] = [];
    const list = createResolvedCollectionReader(
      (query: CollectionQuery) => {
        queries.push(query);
        return queryCollectionRecords(
          session,
          { nodes: "transcript_nodes", edges: "unused" },
          messageCollection,
          "tenant",
          query,
        );
      },
      messageCollection,
      "tenant",
      resolver,
    );
    const context = {
      collections: { message: { list } as unknown as ScopedCollection },
    } as unknown as CoreProcessorContext;
    const history = records.map((record) =>
      mapMessageRecord(record, {
        id: String(record.senderId),
        namespace: "tenant",
        externalId: String(record.senderId),
        participantType: record.senderId === "tool"
          ? "tool"
          : record.senderId === "human"
          ? "human"
          : "agent",
        metadata: {},
        createdAt: date,
        updatedAt: date,
      } as Participant)
    );
    const transcript = await prepareLlmTranscript(context, {
      threadId: "thread",
      participantId: "north",
      history,
    });
    assertEquals(transcript.length, 3);
    assertEquals(transcript[0].role, "assistant");
    if (transcript[0].role === "assistant") {
      assertEquals(transcript[0].reasoning, [{
        ...reasoning,
        value: "own previous thought",
      }]);
    }
    assertEquals("reasoning" in transcript[1], false);
    assertEquals(transcript[2].content[1], {
      ...missing,
      disposition: "attachment",
      resolve: false,
    });
    assertEquals(readIds.includes("must-not-read"), false);
    assertEquals(queries.length, 2);
    const empty = await prepareLlmTranscript(context, {
      threadId: "thread",
      participantId: "north",
      history,
      messageIds: [],
    });
    assertEquals(empty, []);
    assertEquals(queries.length, 2);
  } finally {
    await db.close();
  }
});

Deno.test("Agent window predicates select private scope, branch and anchor before PGlite pagination", async () => {
  const db = await createTestDatabase({ url: ":memory:" });
  const session = createSqlSession(db);
  try {
    const records = Array.from({ length: 2005 }, (_, index) => ({
      id: `m${String(index).padStart(4, "0")}`,
      namespace: "tenant",
      threadId: "thread",
      createdAt: new Date(index * 1000).toISOString(),
      updatedAt: new Date(index * 1000).toISOString(),
      ...(index % 500 === 0 ? { visibility: { kind: "public" } } : {
        visibility: { kind: "internal" },
        historyScopeId: index % 333 === 0 ? " \tscope\u00a0" : "other",
      }),
    })) as CollectionRecord[];
    await session.query(
      "CREATE TABLE window_nodes (id text,namespace text,type text,data jsonb,created_at timestamptz,updated_at timestamptz,content text)",
    );
    await session.query(
      "INSERT INTO window_nodes SELECT r->>'id','tenant','message',r,(r->>'createdAt')::timestamptz,(r->>'createdAt')::timestamptz,'' FROM jsonb_array_elements($1::jsonb) r",
      [JSON.stringify(records)],
    );
    const window = {
      threadRecord: { id: "thread", namespace: "tenant" } as CollectionRecord,
      records: [],
      participantRecords: [],
      anchorActive: true,
      anchor: records[2001],
      historyScopeId: "scope",
      branch: { root: records[1200], head: records[1800] },
    };
    const query = {
      filter: threadMessageWindowFilter(window),
      order: { field: "createdAt" as const, direction: "desc" as const },
      limit: 3,
    };
    const page = await queryCollectionRecords(
      session,
      { nodes: "window_nodes", edges: "unused" },
      messageCollection,
      "tenant",
      query,
    );
    assertEquals(page.map((r) => r.id), ["m2000", "m1998", "m1000"]);
    const expected = records.filter((record) =>
      threadMessageRecordInWindow(window, record)
    ).reverse().map((r) => r.id);
    const all = await queryCollectionRecords(
      session,
      { nodes: "window_nodes", edges: "unused" },
      messageCollection,
      "tenant",
      { ...query, limit: 1000 },
    );
    assertEquals(all.map((r) => r.id), expected);
  } finally {
    await db.close();
  }
});
