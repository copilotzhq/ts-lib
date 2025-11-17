import { createCopilotz } from "../index.ts";
import type { AgentConfig, AgentLlmOptionsResolverArgs } from "../index.ts";
import type { ProviderConfig, ChatMessage } from "../connectors/llm/types.ts";

const hasAudioPart = (messageContent: ChatMessage["content"] | undefined): boolean => {
    if (!Array.isArray(messageContent)) return false;
    return messageContent.some((part) => {
        return Boolean(part && typeof part === "object" && (part as { type?: string }).type === "input_audio");
    });
};

const selectModelForInput = ({ payload }: AgentLlmOptionsResolverArgs): ProviderConfig => {
    // Check if any message contains an audio part
    const hasAudioInput = payload.messages.some(msg => hasAudioPart(msg.content));

    const config = payload.config || {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 100000,
        apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
    };

    if (hasAudioInput) {
        return {
            provider: "openai",
            model: "gpt-audio-mini",
            temperature: 0.4,
            maxTokens: 100000,
            apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
        };
    }

    return config;
};

const testAgent: AgentConfig = {
    id: "test-agent-1",
    name: "TestBot",
    role: "assistant",
    instructions: "You are a helpful test assistant. Keep responses brief and friendly.",
    llmOptions: selectModelForInput,
    allowedTools: ['list_directory', 'read_file'],
};
const testAgent2: AgentConfig = {
    id: "test-agent-2",
    name: "TestBot2",
    role: "assistant",
    instructions: "You are a helpful test assistant 2. Keep responses brief and friendly.",
    llmOptions: selectModelForInput,
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