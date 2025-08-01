import { createThread, type AgentConfig, type MCPServerConfig, type ChatCallbacks } from "copilotz/agents";

const log = (...args: any[]) =>{
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${args.join(" ")}\n`;
    Deno.writeTextFileSync("mcp-client.log", logMessage, { append: true });
}

// MCP server config using our own test server
const testMcpServer: MCPServerConfig = {
    name: "test-server",
    description: "Test MCP server using official SDK",
    transport: {
        type: "stdio",
        command: "deno",
        args: ["run", "-A", "./agents/examples/mcp/mcp-server.ts"]
    },
    // Test both tools
    capabilities: ["get_current_time", "echo_message"],
};

// Test agent that uses both native and MCP tools
const testAgent: AgentConfig = {
    name: "MCPTestAgent",
    role: "MCP Integration Tester",
    description: "Tests MCP server integration with official SDK",
    personality: "Thorough and methodical",
    instructions: "You test MCP integration by using both native and MCP tools. Be clear about which tools you're using.",
    allowedTools: [
        // Native tools
        "http_request",
        "get_current_time", // This is a native tool too, will test both
        // MCP tools from our test server
        "test-server_get_current_time", // MCP version
        "test-server_echo_message",
    ],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.1
    }
};

// Detailed callbacks to track what happens
const callbacks: ChatCallbacks = {
    onToolCalling: (data) => {
        const toolType = data.toolName.startsWith("test-server_") ? "MCP" : "Native";
        log(`🔧 [${toolType}] Calling tool: ${data.toolName}`);
    },
    onToolCompleted: (data) => {
        const toolType = data.toolName.startsWith("test-server_") ? "MCP" : "Native";
        if (data.error) {
            log(`❌ [${toolType}] Tool ${data.toolName} failed: ${data.error}`);
        } else {
            log(`✅ [${toolType}] Tool ${data.toolName} completed in ${data.duration}ms`);
        }
    },
    onMessageSent: (data) => {
        log(`💬 ${data.senderId}: ${data.content}`);
    }
};

export async function testOfficialMcpSdk() {
    log("🧪 Testing Official MCP SDK Integration...\n");
    log("📋 Using our custom MCP server built with official TypeScript SDK\n");

    try {
        const result = await createThread(
            {
                threadId: crypto.randomUUID(),
                content: "Please test both native and MCP tools: 1) Use the native get_current_time tool 2) Use the MCP get_current_time tool 3) Echo the message 'Hello from MCP!' using the MCP echo tool",
                participants: ["MCPTestAgent"]
            },
            {
                agents: [testAgent],
                mcpServers: [testMcpServer],
                callbacks,
                dbConfig: { url: ':memory:' },
                stream: false,
            }
        );

        log("\n✅ Official MCP SDK integration test completed!");
        log("🎯 Successfully tested both native and MCP tools!");
        log(`📋 Thread ID: ${result.threadId}`);
        
    } catch (error) {
        console.error("❌ Official MCP SDK test failed:", error);
    }
}

// Run test if executed directly
if (import.meta.main) {
    await testOfficialMcpSdk();
} 