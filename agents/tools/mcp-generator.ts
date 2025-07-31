import type { RunnableTool, MCPServerConfig } from "../Interfaces.ts";
import { Client } from "modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "modelcontextprotocol/sdk/client/stdio.js";

interface MCPTool {
    name: string;
    description?: string;
    inputSchema: any;
}

/**
 * MCP client using the official MCP TypeScript SDK
 */
class MCPClient {
    private config: MCPServerConfig;
    private client?: Client;
    private transport?: StdioClientTransport;
    private connected = false;

    constructor(config: MCPServerConfig) {
        this.config = config;
    }

    /**
     * Connect to the MCP server using the official MCP SDK
     */
    async connect(): Promise<void> {
        if (this.connected) return;

        try {
            if (this.config.transport.type === "stdio") {
                await this.connectStdio();
            } else {
                // Note: Official MCP SDK currently only supports stdio transport
                // SSE and WebSocket transports would need custom implementation
                throw new Error(`Transport type ${this.config.transport.type} not yet supported by official MCP SDK. Only 'stdio' is currently supported.`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to connect to MCP server ${this.config.name}: ${errorMessage}`);
        }
    }

    /**
     * Connect using stdio transport with official MCP SDK
     */
    private async connectStdio(): Promise<void> {
        if (!this.config.transport.command) {
            throw new Error("Command is required for stdio transport");
        }

        try {
            // Create stdio transport using official SDK
            this.transport = new StdioClientTransport({
                command: this.config.transport.command,
                args: this.config.transport.args || [],
                env: this.config.env || undefined
            });

            // Create client using the transport
            this.client = new Client({
                name: "Copilotz",
                version: "1.0.0"
            }, {
                capabilities: {}
            });

            // Connect and initialize
            await this.client.connect(this.transport);

            this.connected = true;
        } catch (error) {
            // Clean up on error
            if (this.transport) {
                await this.transport.close();
                this.transport = undefined;
            }
            this.client = undefined;
            throw error;
        }
    }





    /**
     * List available tools from the MCP server using official SDK
     */
    async listTools(): Promise<MCPTool[]> {
        if (!this.client) {
            throw new Error("Not connected to MCP server");
        }

        try {
            const response = await this.client.listTools();
            return response.tools || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Call a tool on the MCP server using official SDK with timeout
     */
    async callTool(name: string, arguments_: any): Promise<any> {
        if (!this.client) {
            throw new Error("Not connected to MCP server");
        }

        try {
            
            // Add 10-second timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`MCP tool call timeout after 10 seconds`)), 10000);
            });

            const callPromise = this.client.callTool({
                name: name,
                arguments: arguments_
            });
            
            const response = await Promise.race([callPromise, timeoutPromise]);
            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to call MCP tool ${name}: ${errorMessage}`);
        }
    }

    /**
     * Disconnect from the MCP server using official SDK cleanup
     */
    async disconnect(): Promise<void> {
        try {
            // Close the transport connection
            if (this.transport) {
                await this.transport.close();
                this.transport = undefined;
            }

            this.client = undefined;
        } catch (error) {

        }

        this.connected = false;
    }
}

/**
 * Creates a tool execution function for an MCP tool
 */
function createMcpExecutor(client: MCPClient, originalToolName: string, serverName: string) {
    return async (params: any = {}) => {
        try {
            const result = await client.callTool(originalToolName, params);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`MCP tool execution failed: ${errorMessage}`);
        }
    };
}

/**
 * Generates RunnableTool instances from an MCP server configuration
 */
export async function generateMcpTools(mcpConfig: MCPServerConfig): Promise<RunnableTool[]> {
    const tools: RunnableTool[] = [];
    const client = new MCPClient(mcpConfig);

    try {
        // Connect to the MCP server
        await client.connect();

        // Get available tools
        const mcpTools = await client.listTools();

        // Filter tools based on capabilities if specified
        const filteredTools = mcpConfig.capabilities 
            ? mcpTools.filter(tool => mcpConfig.capabilities!.includes(tool.name))
            : mcpTools;

        // Convert each MCP tool to a RunnableTool
        for (const mcpTool of filteredTools) {
            const toolKey = `${mcpConfig.name}_${mcpTool.name}`;
            const toolName = `${mcpConfig.name}: ${mcpTool.name}`;
            const toolDescription = mcpTool.description || 
                `${mcpConfig.description ? mcpConfig.description + ': ' : ''}${mcpTool.name}`;

            const tool: RunnableTool = {
                key: toolKey,
                name: toolName,
                description: toolDescription,
                inputSchema: mcpTool.inputSchema || {
                    type: "object",
                    properties: {},
                },
                execute: createMcpExecutor(client, mcpTool.name, mcpConfig.name),
            };

            tools.push(tool);
        }

        // Note: In a production implementation, you'd want to manage the client lifecycle better
        // For now, we'll keep the connection open during tool execution

    } catch (error) {

        await client.disconnect();
    }

    return tools;
}

/**
 * Generates tools from multiple MCP server configurations
 * Note: Currently only supports stdio transport via official MCP SDK
 */
export async function generateAllMcpTools(mcpConfigs: MCPServerConfig[]): Promise<RunnableTool[]> {
    const allTools: RunnableTool[] = [];
    
    // Filter for supported transports
    const supportedConfigs = mcpConfigs.filter(config => {
        if (config.transport.type !== "stdio") {
            return false;
        }
        return true;
    });
    
    // Process each supported MCP server configuration
    const toolPromises = supportedConfigs.map(async (config) => {
        try {
            const tools = await generateMcpTools(config);
            return tools;
        } catch (error) {

            return [];
        }
    });

    const toolArrays = await Promise.all(toolPromises);
    
    // Flatten the arrays
    toolArrays.forEach(tools => {
        allTools.push(...tools);
    });
    
    return allTools;
}

/**
 * Cleanup function to disconnect all MCP clients
 * Should be called when the agent system shuts down
 */
export async function disconnectAllMcpServers(): Promise<void> {
    // In a production implementation, you'd maintain a registry of active clients
    // and disconnect them here
}

// Export MCPClient for testing purposes
export { MCPClient }; 