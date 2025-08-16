import { createThread } from "../../index.ts";
import { createOperations } from "../../database/operations.ts";
import { ToolExecutionContext, AgentConfig, Message } from "../../Interfaces.ts";

interface AskQuestionParams {
    question: string;
    targetAgent: string;
    timeout?: number;
}

export default {
    key: "ask_question",
    name: "Ask Question",
    description: "Ask a specific question to another agent and get a single answer. Creates a temporary thread that closes after receiving the response.",
    inputSchema: {
        type: "object",
        properties: {
            question: { type: "string", description: "The question to ask." },
            targetAgent: { type: "string", description: "The name of the agent to ask the question to." },
            timeout: { type: "number", description: "Maximum time to wait for answer in seconds (default: 30)." },
        },
        required: ["question", "targetAgent"],
    },
    execute: async ({ question, targetAgent, timeout = 30 }: AskQuestionParams, context?: ToolExecutionContext) => {
        // Get database instance from context or fallback to global
        const db = context?.db;
        const ops = createOperations(db);

        if (!context?.senderId) {
            throw new Error("Sender ID is required to ask questions");
        }

        // Check if target agent exists in available agents
        const availableAgents = context.agents || [];
        const targetAgentConfig = availableAgents.find((agent: AgentConfig) => agent.name === targetAgent);

        if (!targetAgentConfig) {
            throw new Error(`Target agent "${targetAgent}" not found in available agents: ${availableAgents.map((a: AgentConfig) => a.name).join(', ')}`);
        }

        // Create a temporary thread for the question
        const questionThreadId = crypto.randomUUID();

        try {
            // Send the question to the target agent in a new thread
            await createThread(
                {
                    content: question,
                    threadId: questionThreadId,
                    senderId: context.senderId,
                    senderType: context.senderType,
                    threadName: `Question from ${context.senderId}`,
                    participants: [targetAgent],
                },
                {
                    agents: [targetAgentConfig],
                    tools: context.tools || [],
                    dbInstance: db,
                    stream: true,
                    callbacks: context.callbacks,
                }
            );

            // Poll for the answer with timeout
            const startTime = Date.now();
            const timeoutMs = timeout * 1000;
            let answer = null;

            while (Date.now() - startTime < timeoutMs) {
                // Get message history for the question thread
                const messages = await ops.getMessageHistory(questionThreadId, targetAgent, 10);

                // Look for a response from the target agent (excluding the initial question)
                const targetAgentResponse = messages.find((msg: Message) =>
                    msg.senderId === targetAgent &&
                    msg.senderType === "agent" &&
                    msg.content &&
                    msg.content.trim() !== ""
                );

                if (targetAgentResponse) {
                    answer = targetAgentResponse.content;
                    break;
                }

                // Wait a bit before checking again
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Archive the question thread
            const summary = answer
                ? `Question: "${question}" - Answer: "${answer?.substring(0, 100)}${answer?.length > 100 ? '...' : ''}"`
                : `Question: "${question}" - No answer received (timeout)`;

            await ops.archiveThread(questionThreadId, summary);

            if (!answer) {
                throw new Error(`No answer received from ${targetAgent} within ${timeout} seconds`);
            }

            return {
                success: true,
                question,
                answer,
                targetAgent,
                threadId: questionThreadId,
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                question,
                targetAgent,
            };
        }
    },
};