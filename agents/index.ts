// Import the createThread function from the threads folder
import { createThread } from "./threads/index.ts";
// Import the Interfaces
import type * as Interfaces from "./Interfaces.ts";

// Export all interfaces
export * from "./Interfaces.ts";

// Export all tools from the registry
export * from "./tools/registry/index.ts";

// Export tool generators
export * from "./tools/api-generator.ts";
export * from "./tools/mcp-generator.ts";

// Export database
export * from "./database/index.ts";

export * as utils from "./utils/index.ts";

// Export the run function for interactive session
export async function run({
    participants,
    agents,
    tools,
    apis,
    mcpServers,
    callbacks,
    dbConfig,
    dbInstance
}: {
    agents: Interfaces.AgentConfig[];
    participants?: string[];
    tools?: Interfaces.RunnableTool[];
    apis?: Interfaces.APIConfig[];
    mcpServers?: Interfaces.MCPServerConfig[];
    callbacks?: Interfaces.ChatCallbacks;
    dbConfig?: Interfaces.DatabaseConfig;
    dbInstance?: any;
}) {
    console.log("🎯 Starting Interactive Session");
    console.log("Type your questions, or 'quit' to exit\n");

    const threadId = crypto.randomUUID();

    // Loop until the user quits
    while (true) {

        // Prompt the user for a question
        const question = prompt("Question: ");

        if (!question || question.toLowerCase() === 'quit') {
            console.log("👋 Ending session. Goodbye!");
            break;
        }

        console.log("\n🔬 Thinking...\n");

        try {

            // Create a new thread for the question
            await createThread(
                // Pass the question and participants
                {
                    threadId, // keep the same threadId for the same session
                    content: question,
                    participants: participants || agents.map(agent => agent.name)
                },
                {
                    // Pass the agents, tools, apis, mcpServers, callbacks, and dbConfig
                    agents,
                    tools,
                    apis,
                    mcpServers,
                    callbacks,
                    dbConfig,
                    dbInstance,
                    stream: true,
                }
            );

        } catch (error) {
            console.error("❌ Session failed:", error);
        }

        console.log("\n" + "-".repeat(60) + "\n");
    }
}

export { createThread };