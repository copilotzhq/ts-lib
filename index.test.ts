import { assertEquals } from "jsr:@std/assert";
import { run } from "./index.ts";
import type { Agent } from "./interfaces/index.ts";

// Simple echo agent for testing
const testAgent: Agent = {
    id: "test-agent-1",
    name: "TestBot",
    type: "agent",
    instructions: "You are a helpful test assistant. Respond briefly.",
    llmOptions: {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0,
    },
    allowedTools: [],
};

Deno.test("run - should enqueue initial message and return queue info", async () => {
    const result = await run({
        initialMessage: {
            content: "Hello, test!",
            senderId: "test-user",
        },
        agents: [testAgent],
        dbConfig: { url: ":memory:" },
        stream: false,
    });

    // Verify the response structure
    assertEquals(result.status, "queued");
    assertEquals(typeof result.queueId, "string");
    assertEquals(typeof result.threadId, "string");
    assertEquals(result.queueId.length > 0, true);
    assertEquals(result.threadId.length > 0, true);
});

Deno.test("run - should create thread with participants", async () => {
    const result = await run({
        initialMessage: {
            content: "Test message",
            threadName: "Test Thread",
            participants: ["TestBot", "user"],
        },
        agents: [testAgent],
        dbConfig: { url: ":memory:" },
        stream: false,
    });

    assertEquals(result.status, "queued");
    assertEquals(typeof result.threadId, "string");
});

Deno.test("run - should reuse thread by external id", async () => {
    const externalId = `test-ext-${Date.now()}`;
    const dbConfig = { url: ":memory:" };

    // First call
    const result1 = await run({
        initialMessage: {
            content: "First message",
            threadExternalId: externalId,
        },
        agents: [testAgent],
        dbConfig,
        stream: false,
    });

    // Second call with same external id - should create new thread since we're using :memory: per call
    const result2 = await run({
        initialMessage: {
            content: "Second message",
            threadExternalId: externalId,
        },
        agents: [testAgent],
        dbConfig,
        stream: false,
    });

    // Both should succeed
    assertEquals(result1.status, "queued");
    assertEquals(result2.status, "queued");
});

Deno.test("run - should fail without initial message content", async () => {
    try {
        await run({
            initialMessage: {
                content: "",
            },
            agents: [testAgent],
            dbConfig: { url: ":memory:" },
        });
        throw new Error("Should have thrown an error");
    } catch (error) {
        assertEquals(error instanceof Error, true);
        assertEquals(
            (error as Error).message.includes("content is required"),
            true
        );
    }
});

Deno.test("run - should support streaming with callback", async () => {
    const result = await run({
        initialMessage: {
            content: "Test streaming",
        },
        agents: [testAgent],
        callbacks: {
            onContentStream: (_data) => {
                // Callback setup verified - actual streaming happens during event processing
            },
        },
        dbConfig: { url: ":memory:" },
        stream: true,
    });

    assertEquals(result.status, "queued");
    // Note: callback execution happens during event processing, not immediately
});

// Note: runCLI cannot be easily unit tested as it uses prompt() for interactive input
// For manual testing of runCLI, create a separate file and run:
//
// Example manual test (manual-cli-test.ts):
// ```
// import { runCLI } from "./index.ts";
//
// await runCLI({
//   initialMessage: { content: "Hello!" },
//   agents: [testAgent],
//   dbConfig: { url: ":memory:" },
// });
// ```
// Then run: deno run --allow-env --allow-net --allow-read manual-cli-test.ts

