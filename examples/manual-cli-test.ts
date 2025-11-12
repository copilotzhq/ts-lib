import { createCopilotz } from "../index.ts";
import type { AgentConfig } from "../index.ts";

const testAgent: AgentConfig = {
    id: "test-agent-1",
    name: "TestBot",
    role: "assistant",
    instructions: "You are a helpful test assistant. Keep responses brief and friendly.",
    llmOptions: {
        provider: "openai",
        model: "gpt-5",
        temperature: 1,
        maxTokens: 100000,
        apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
    },
    allowedTools: ['list_directory', 'read_file'],
};
const testAgent2: AgentConfig = {
    id: "test-agent-2",
    name: "TestBot2",
    role: "assistant",
    instructions: "You are a helpful test assistant 2. Keep responses brief and friendly.",
    llmOptions: {
        provider: "openai",
        model: "gpt-5",
        temperature: 1,
        maxTokens: 100000,
        apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
    },
    allowedTools: ['list_directory', 'read_file'],
};

const dbFilePath = `${Deno.cwd()}/db.db`;

const THREAD_EXT_ID = "manual-cli-test-2";

const copilotz = await createCopilotz({
    agents: [testAgent, testAgent2],
    dbConfig: { url: `file://${dbFilePath}` },
    stream: true,
});

const controller = copilotz.start({
    content: "Hello! Can you introduce yourself?",
    sender: { type: "user", name: "CLI" },
    thread: { externalId: THREAD_EXT_ID, participants: ["TestBot"] },
});

await controller.closed;

await copilotz.shutdown();