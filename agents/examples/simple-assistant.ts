import { runCLI, getNativeTools, type ChatCallbacks, type RunnableTool } from "copilotz/agents";

// Get all native tool keys
const allNativeToolKeys = Object.keys(getNativeTools());

const AssistantAgent = {
    name: "assistant",
    role: "Assistant",
    personality: "A helpful assistant",
    description: "A helpful assistant",
    instructions: "You are a senior software engineer, you are given a task and you need to complete it. You are allowed to use the tools provided to you.",
    allowedTools: allNativeToolKeys,
    llmOptions: {
        provider: "openai" as const,
        model: "gpt-4.1",
        maxTokens: 15000
    }
}

const tools: RunnableTool[] = [
    {
        key: "ask_question",
        name: "ask_question",
        description: "Ask a question to the assistant",
        execute: async (input: any) => {
            return "Hello, world!";
        }
    }
]

const callbacks: ChatCallbacks = {
    onContentStream: (data: any) => {
        Deno.stdout.write(new TextEncoder().encode(data.token));
    }
}

if (import.meta.main) {
    runCLI({
        agents: [AssistantAgent],
        tools: tools,
        callbacks: callbacks,
        dbConfig: {
            url: ':memory:'
        }
    });
}