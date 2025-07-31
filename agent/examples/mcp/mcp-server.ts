#!/usr/bin/env -S deno run -A

/**
 * Simple MCP Server using the official TypeScript SDK
 * Based on: https://modelcontextprotocol.io/quickstart/server#node
 */

import { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "npm:zod";

// Create server instance
const server = new McpServer({
  name: "test-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register get_current_time tool
server.tool(
  "get_current_time",
  "Get the current time and date",
  {
    format: z.string().optional().describe("Time format (readable or iso)")
  },
  async ({ format }) => {
    const selectedFormat = format || "readable";
    const now = new Date();
    
    const timeString = selectedFormat === "iso" 
      ? now.toISOString()
      : now.toLocaleString("en-US", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit", 
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });

    return {
      content: [
        {
          type: "text",
          text: `Current time (${selectedFormat}): ${timeString}`
        }
      ]
    };
  }
);

// Register echo_message tool
server.tool(
  "echo_message",
  "Echo back a message with a prefix",
  {
    message: z.string().describe("Message to echo back")
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text", 
          text: `Echo from MCP server: ${message}`
        }
      ]
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // console.error("🚀 Test MCP Server started on stdio transport");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  Deno.exit(1);
}); 