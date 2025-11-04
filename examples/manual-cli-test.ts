/**
 * Manual CLI Test
 * 
 * This file provides a manual test for the Copilotz CLI controller.
 * Run with: deno run --allow-env --allow-net --allow-read manual-cli-test.ts
 * 
 * You can type messages and the agent will respond.
 * Type 'quit' to exit.
 */

import { createCopilotz } from "../index.ts";
import type { Agent, Event, ContentStreamData } from "../interfaces/index.ts";

const testAgent: Agent = {
    id: "test-agent-1",
    name: "TestBot",
    type: "agent",
    instructions: "You are a helpful test assistant. Keep responses brief and friendly.",
    llmOptions: {
        provider: "openai",
        model: "gpt-5",
        temperature: 1,
        apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
    },
    allowedTools: ['list_directory', 'read_file'],
};

console.log("Starting CLI test...\n");

const copilotz = await createCopilotz({
    agents: [testAgent],
    callbacks: {
        onContentStream: (data: ContentStreamData) => {
            if (!data.isComplete) {
                Deno.stdout.writeSync(new TextEncoder().encode(data.token));
            } else {
                console.log("\n");
            }
        },
        onEvent: (event: Event) => {
            // console.log(event.type+":", event);
        },
    },
    dbConfig: { url: ":memory:" },
    stream: true,
});

const controller = copilotz.start({
    initialMessage: {
        content: "Hello! Can you introduce yourself?",
    },
});

await controller.closed;

await copilotz.shutdown();

