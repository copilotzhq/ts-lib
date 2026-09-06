import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { createWebChannelAdapter } from "./index.ts";

Deno.test("Web Channel Adapter accepts one occurrence", async () => {
  const accepted = await createWebChannelAdapter().accept({
    method: "POST",
    headers: { "idempotency-key": "web-1" },
    context: { actor: { id: "person" } },
    body: { externalThreadId: "thread", content: "hello" },
  }, {} as never);
  assertEquals(accepted.status, 202);
  assertEquals(accepted.occurrences, [{
    id: "person:web-1",
    input: {
      externalThreadId: "person:thread",
      sender: { id: "person", externalId: "person", participantType: "human" },
      content: "hello",
      metadata: { clientMessageId: "web-1" },
    },
  }]);
});

Deno.test("Web Channel Adapter normalizes declared thread participants", async () => {
  const received = await createWebChannelAdapter().receive({
    externalThreadId: "web-thread-1",
    sender: {
      externalId: "user",
      participantType: "human",
    },
    recipients: ["north"],
    content: "hello",
    thread: {
      participants: [
        "north",
        { externalId: "south", participantType: "human", name: "South" },
      ],
    },
  }, {} as never);
  assertEquals(received.thread?.participants, [
    "north",
    { externalId: "south", participantType: "human", name: "South" },
  ]);
  assertEquals(Object.isFrozen(received.thread), true);
  assertEquals(Object.isFrozen(received.thread?.participants), true);
  assertEquals(Object.isFrozen(received.thread?.participants?.[1]), true);
});

Deno.test("Web Channel Adapter rejects non-array declared thread participants", () => {
  assertThrows(
    () =>
      createWebChannelAdapter().receive({
        externalThreadId: "web-thread-1",
        sender: { externalId: "user", participantType: "human" },
        recipients: ["north"],
        content: "hello",
        thread: { participants: "north" },
      }, {} as never),
    TypeError,
    "participants must be an array",
  );
});

Deno.test("Core message wire content passes through Web ingress and the shared decoder", async () => {
  const { message } = await import(
    "../../../core-collections/authoring/message-input/index.ts"
  );
  const input = message({
    thread: "thread",
    participant: "human",
    content: [
      "hello",
      {
        type: "image",
        bytes: new Uint8Array([0, 255, 128]),
        mediaType: "image/png",
        name: "picture",
      },
    ],
  });
  assertExists(input.payload);
  const adapter = createWebChannelAdapter();
  const accepted = await adapter.accept({
    method: "POST",
    headers: { "idempotency-key": "media" },
    context: { actor: { id: "human" } },
    body: { externalThreadId: "thread", content: input.payload.content },
  }, {} as never);
  const received = await adapter.receive(
    accepted.occurrences[0].input,
    {} as never,
  );
  assertEquals(received.content, ["hello", {
    type: "image",
    bytes: new Uint8Array([0, 255, 128]),
    mediaType: "image/png",
    name: "picture",
  }]);
});
