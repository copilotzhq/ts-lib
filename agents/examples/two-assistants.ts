import { runCLI, getNativeTools } from "copilotz/agents";

// Get all native tool keys
const allNativeToolKeys = Object.keys(getNativeTools());

const AssistantAgent = {
    name: "AssistantAgent",
    role: "Assistant",
    personality: "A helpful assistant",
    description: "A helpful assistant",
    instructions: `
Communicate with the ApiAgent to get the information you need.
`,
    allowedTools: ['ask_question'],
    allowedAgents: ['ApiAgent'],
    llmOptions: {
        provider: "openai" as const,
        model: "gpt-5-mini",
        temperature: 1,
        maxTokens: 16384
    }
}

const ApiAgent = {
    name: "ApiAgent",
    role: "ApiAgent",
    personality: "technical, precise, proactive",
    description: "A technical api agent",
    instructions: "You are a technical api agent, you are given a task and you need to complete it. Use the <tool_calls> tag to call the tools.",
    allowedTools: ['http_request'],
    llmOptions: {
        provider: "openai" as const,
        model: "gpt-4o",
        temperature: 1,
        maxTokens: 16384
    }
}


const callbacks = {
    onEvent: (event: any) => {
        console.log(event);
    },
    onContentStream: (data: any) => {
        Deno.stdout.write(new TextEncoder().encode(data.token));
    }
}


if (import.meta.main) {
    runCLI({
        participants: ['AssistantAgent'],
        agents: [AssistantAgent, ApiAgent],
        tools: [],
        callbacks: callbacks,
        dbConfig: {
            url: ':memory:'
        }
    });
}