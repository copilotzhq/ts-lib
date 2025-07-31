import {
  assert,
  assertExists,
} from "jsr:@std/assert";
import { createThread } from "../index.ts";
import { createDatabase, queue } from "../database/index.ts";
import { eq } from "drizzle-orm";
import {
  AgentConfig, RunnableTool,
  ToolCallingData,
  ToolCompletedData,
  MessageSentData,
  MessageReceivedData,
  TokenStreamData,
  LLMCompletedData
} from "../Interfaces.ts";

// 1. Define a user-defined tool
const user_test_tool: RunnableTool = {
  key: "user_test_tool",
  name: "User Test Tool",
  description: "A simple tool for testing purposes.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
  },
  execute: async ({ message }) => {
    return { response: `You said: ${message}` };
  },
};


// 2. Define test agents with allowed agents and tools
const Albert: AgentConfig = {
  name: "Albert",
  role: "Test Agent",
  personality: "Helpful and friendly",
  instructions: "You are a test agent. Your goal is to be helpful.",
  description: "This is a test agent",
  allowedTools: ["create_thread", "end_thread", "ask_question", "http_request", "list_directory"],
  allowedAgents: ["Robin"], // Can only communicate with TestAgent2
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 1000,
    topP: 1,
  },
};

const Robin: AgentConfig = {
  name: "Robin",
  role: "Test Agent 2",
  personality: "Helpful and friendly",
  instructions: "You are a test agent. Your goal is to be helpful.",
  description: "This is another test agent",
  allowedTools: ["user_test_tool"],
  allowedAgents: ["Albert"], // Can communicate back to TestAgent
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 1000,
    topP: 1,
  },
};


const Charlie: AgentConfig = {
  name: "Charlie",
  role: "Test Agent 3",
  personality: "Analytical and precise",
  instructions: "You are a test agent focused on analysis.",
  description: "This is a third test agent",
  allowedTools: [],
  allowedAgents: ["Albert", "Robin"],
  llmOptions: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 1000,
    topP: 1,
  },
};

Deno.test("AgentV2 Simple Test", async () => {

  let db: any;

  // 3. Send a message to a new thread with enhanced callbacks
  const result = await createThread(
    {
      content: "Hello, @Albert! Please ask Robin a question what is the size of Japan.",
      participants: ["Albert"],
    },
    {
      agents: [
        Albert,
        Robin,
        Charlie,
      ],
      tools: [user_test_tool],
      stream: true, // Enable streaming
      callbacks: {
        onToolCalling: (data: ToolCallingData) => {
          // console.log('onToolCalling', data);
        },
        onToolCompleted: (data: ToolCompletedData) => {
          // console.log('onToolCompleted', data);
        },
        onMessageReceived: (data: MessageReceivedData) => {
          // console.log('onMessageReceived', data);
        },
        onMessageSent: (data: MessageSentData) => {
          // console.log('onMessageSent', data);
        },
        onTokenStream: (data: TokenStreamData) => { },
        onLLMCompleted: (data: LLMCompletedData) => {
          console.log(`\n🔍 LLM Interaction Debug for ${data.agentName}:`);
          console.log(`📚 Message History (${data.messageHistory.length} messages):`);
          data.messageHistory.forEach((msg, i) => {
            console.log(`  ${i + 1}. [${msg.role}]: ${JSON.stringify(msg.content)}\n`);
          });
          // console.log(`🔧 Available Tools: [${data.availableTools.join(', ')}]`);
          console.log(`📤 LLM Response: ${data.llmResponse?.success ? '✅ Success' : '❌ Failed'}`);
          if (data.llmResponse?.success) {
            console.log(`   Answer: ${JSON.stringify(data.llmResponse.answer)}`);
            console.log(`   Tool Calls: ${data.llmResponse.toolCalls?.length || 0}`);
            if (data.llmResponse.tokens) console.log(`   Tokens: ${data.llmResponse.tokens}`);
          } else {
            console.log(`   Error: ${data.llmResponse?.error}`);
          }
          console.log(`⏱️ Duration: ${data.duration}ms`);
          console.log(`⏰ Timestamp: ${data.timestamp.toISOString()}\n`);
        },
      },
    },
    (dbInstance) => {
      db = dbInstance;
      console.log("💾 Database instance created");
    }
  );

  // 4. Assert that the message was queued
  assertExists(result.queueId);
  assert(result.status === "queued");

  // 5. Check the queue to ensure the message is there
  const [queueItem] = await db
    .select()
    .from(queue)
    .where(eq(queue.id, result.queueId));

  assertExists(queueItem);
  assert(queueItem.status === "completed");
  assertExists(queueItem.threadId);
});

Deno.test("AgentV2 Participants Filter Test", async () => {
  let db: any;
  // 1. Define a user-defined tool
  const user_test_tool: RunnableTool = {
    key: "user_test_tool",
    name: "User Test Tool",
    description: "A simple tool for testing purposes.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
    execute: async ({ message }) => {
      return { response: `You said: ${message}` };
    },
  };

  // 3. Send a message targeting only Albert and Robin (excluding Charlie)
  const result = await createThread(
    {
      content: "Hello! This conversation should only include Albert and Robin. How are you doing @Albert?",
      participants: ["Albert", "Robin"], // Charlie should be filtered out
    },
    {
      agents: [Albert, Robin, Charlie], // All 3 agents available in context
      tools: [user_test_tool],
      callbacks: {
        onLLMCompleted: (data: LLMCompletedData) => {
          console.log(`\n🎯 Participants Filter Test - Agent: ${data.agentName}`);
          // Charlie should never appear in these logs since it's not a participant
          assert(data.agentName === "Albert" || data.agentName === "Robin");
        },

      },
    },
    (dbInstance) => {
      db = dbInstance;
      console.log("💾 Database instance created");
    }
  );

  // 4. Assert that the message was queued
  assertExists(result.queueId);
  assert(result.status === "queued");

  // 5. Check the queue to ensure the message is there
  const [queueItem] = await db
    .select()
    .from(queue)
    .where(eq(queue.id, result.queueId));

  assertExists(queueItem);
  assert(queueItem.status === "completed");
  assertExists(queueItem.threadId);
});

Deno.test("AgentV2 Question Tool Test", async () => {
  let db: any;
  // Define test agents
  const questioner: AgentConfig = {
    name: "Questioner",
    role: "Curious Agent",
    personality: "Inquisitive and direct",
    instructions: "You ask questions to other agents to gather information. Use the question tool when you need specific information from another agent.",
    description: "An agent that asks questions",
    allowedTools: ["ask_question"], // Has access to the question tool
    allowedAgents: ["Expert"],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      topP: 1,
    },
  };

  const expert: AgentConfig = {
    name: "Expert",
    role: "Knowledge Expert",
    personality: "Knowledgeable and helpful",
    instructions: "You are an expert in various topics. Answer questions clearly and concisely.",
    description: "An expert agent that answers questions",
    allowedTools: [],
    allowedAgents: ["Questioner"],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      topP: 1,
    },
  };

  const helper: AgentConfig = {
    name: "Helper",
    role: "Assistant Agent",
    personality: "Supportive and resourceful",
    instructions: "You help coordinate tasks and provide assistance when needed.",
    description: "A helpful assistant agent",
    allowedTools: [],
    allowedAgents: ["Questioner", "Expert"],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      topP: 1,
    },
  };

  // Send a message asking the Questioner to use the question tool
  const result = await createThread(
    {
      content: "Please ask the Expert what the capital of France is using the ask_question tool.",
      participants: ["Helper"], // Only Helper participates in main thread
    },
    {
      agents: [questioner, expert, helper], // All three agents available
      callbacks: {
        onLLMCompleted: (data: LLMCompletedData) => {
          console.log(`\n❓ Question Tool Test - Agent: ${data.agentName}`);
          console.log(`📋 System Prompt Preview:`);
          console.log(data.systemPrompt.substring(0, 500) + "...");
          if (data.llmResponse?.toolCalls) {
            console.log(`🔧 Tool calls: ${data.llmResponse.toolCalls.length}`);
            data.llmResponse.toolCalls.forEach(call => {
              console.log(`   - ${call.function.name}: ${JSON.stringify(call.function.arguments)}`);
            });
          }
        },
      },
    },
    (dbInstance) => {
      db = dbInstance;
      console.log("💾 Database instance created");
    }
  );

  // Assert that the message was queued
  assertExists(result.queueId);
  assert(result.status === "queued");

  // Check the queue to ensure the message is there
  const [queueItem] = await db
    .select()
    .from(queue)
    .where(eq(queue.id, result.queueId));

  assertExists(queueItem);
  assert(queueItem.status === "completed");
  assertExists(queueItem.threadId);
});
Deno.test("AgentV2 Two-Participant Fallback Test", async () => {
  const agent1: AgentConfig = {
    name: "Agent1",
    role: "First Agent",
    personality: "Direct and helpful",
    instructions: "You are the first agent in a two-participant conversation.",
    description: "First test agent",
    allowedTools: [],
    allowedAgents: ["Agent2"],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      topP: 1,
    },
  };

  const agent2: AgentConfig = {
    name: "Agent2",
    role: "Second Agent",
    personality: "Responsive and thoughtful",
    instructions: "You are the second agent in a two-participant conversation.",
    description: "Second test agent",
    allowedTools: [],
    allowedAgents: ["Agent1"],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      topP: 1,
    },
  };

  // Test 1: Two-participant conversation (user + agent) - should activate fallback
  console.log("\n🔹 Test 1: Two-participant conversation (user + Agent1)");
  const result1 = await createThread(
    {
      content: "Hello! This should automatically route to Agent1.",
      participants: ["Agent1"], // Only Agent1 participates (+ user = 2 participants)
    },
    {
      agents: [agent1, agent2],
      callbacks: {
        onLLMCompleted: (data) => {
          console.log(`   ✅ Agent responded: ${data.agentName}`);
        },
      },
    }
  );

  // Test 2: Three-participant conversation - should NOT activate fallback
  console.log("\n🔹 Test 2: Three-participant conversation (user + Agent1 + Agent2)");
  const result2 = await createThread(
    {
      content: "Hello! This should require explicit mentions.",
      participants: ["Agent1", "Agent2"], // Two agents + user = 3 participants
    },
    {
      agents: [agent1, agent2],
      callbacks: {
        onLLMCompleted: (data) => {
          console.log(`   ❌ Unexpected: ${data.agentName} responded without mention`);
        },
      },
    }
  );

  assertExists(result1.queueId);
  assertExists(result2.queueId);
});

Deno.test("AgentV2 Native Tools Test", async () => {
  // Test if the new native tools are available and working

  const { getNativeTools } = await import("../tools/registry/index.ts");
  const tools = getNativeTools();

  // Check that new tools are available
  assert("http_request" in tools);
  assert("read_file" in tools);
  assert("write_file" in tools);
  assert("list_directory" in tools);
  assert("run_command" in tools);

  console.log("✅ All new native tools are available");

  // Test list_directory tool with current directory
  try {
    const listDirResult = await tools.list_directory.execute({ path: "." });
    console.log(`✅ list_directory test passed: found ${listDirResult.count} entries`);
    assert(listDirResult.count > 0);
    assert(Array.isArray(listDirResult.entries));
  } catch (error) {
    console.error("❌ list_directory test failed:", (error as Error).message);
    throw error;
  }

  // Test http_request tool with a simple GET request
  try {
    const httpResult = await tools.http_request.execute({
      url: "https://httpbin.org/json",
      timeout: 10
    });
    console.log(`✅ http_request test passed: status ${httpResult.status}`);
    assert(httpResult.status === 200);
    assert(httpResult.success === true);
    assert(typeof httpResult.body === "object");
  } catch (error) {
    console.log(`⚠️ http_request test skipped (network/timeout): ${(error as Error).message}`);
    // Don't fail the test for network issues
  }

  console.log("✅ Native tools tests completed");
});

Deno.test("AgentV2 Tools Integration Test", async () => {
  // Create an agent that can use the new tools
  const developerAgent: AgentConfig = {
    name: "Developer",
    role: "Software Developer",
    personality: "Practical and solution-oriented",
    instructions: "You are a helpful software developer. Use tools to complete tasks like reading files, making API calls, and running commands. Always explain what you're doing.",
    description: "A developer agent with access to system and API tools",
    allowedTools: ["http_request", "read_file", "write_file", "list_directory", "run_command"],
    allowedAgents: [],
    llmOptions: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1000,
      topP: 1,
    },
  };

  // Test 1: Ask agent to explore the current directory
  console.log("\n🔧 Test 1: Directory exploration");
  const result1 = await createThread(
    {
      content: "Please explore the current directory and tell me what files are here. Use the list_directory tool.",
      participants: ["Developer"],
    },
    {
      agents: [developerAgent],
      callbacks: {
        onToolCalling: (data) => {
          console.log(`   🔨 ${data.agentName} is calling tool: ${data.toolName}`);
        },
        onToolCompleted: (data) => {
          console.log(`   ✅ Tool ${data.toolName} completed ${data.error ? "with error" : "successfully"}`);
        },
        onLLMCompleted: (data) => {
          if (data.llmResponse?.success && data.llmResponse?.toolCalls && data.llmResponse.toolCalls.length > 0) {
            console.log(`   🤖 ${data.agentName} wants to use ${data.llmResponse.toolCalls.length} tool(s)`);
          }
        },
      },
    }
  );

  // Test 2: Ask agent to read a specific file
  console.log("\n🔧 Test 2: File reading");
  const result2 = await createThread(
    {
      content: "Please read the content of deno.json file and tell me about the project configuration.",
      participants: ["Developer"],
    },
    {
      agents: [developerAgent],
      callbacks: {
        onToolCalling: (data) => {
          console.log(`   🔨 ${data.agentName} is calling tool: ${data.toolName} with args:`, JSON.stringify(data.toolInput).substring(0, 100));
        },
        onToolCompleted: (data) => {
          console.log(`   ✅ Tool ${data.toolName} completed`);
        },
      },
    }
  );

  // Test 3: Ask agent to make an API call
  console.log("\n🔧 Test 3: API request");
  const result3 = await createThread(
    {
      content: "Please make an HTTP request to https://api.github.com/zen to get a random zen quote and share it with me.",
      participants: ["Developer"],
    },
    {
      agents: [developerAgent],
      callbacks: {
        onToolCalling: (data) => {
          console.log(`   🔨 ${data.agentName} is calling tool: ${data.toolName}`);
        },
        onToolCompleted: (data) => {
          console.log(`   ✅ Tool ${data.toolName} completed`);
        },
      },
    }
  );

  // Verify all tests completed
  assertExists(result1.queueId);
  assertExists(result2.queueId);
  assertExists(result3.queueId);

  console.log("\n✅ All tools integration tests completed");
});

Deno.test("AgentV2 All Tools Summary", async () => {
  const { getNativeTools } = await import("../tools/registry/index.ts");
  const tools = getNativeTools();

  const toolNames = Object.keys(tools);
  console.log(`\n📋 AgentV2 Native Tools Summary (${toolNames.length} tools):`);

  // Categorize tools
  const categories = {
    "Core": ["verbal_pause", "ask_question", "create_thread", "end_thread", "create_task"],
    "File System": ["read_file", "write_file", "list_directory", "search_files"],
    "Network": ["http_request", "fetch_text"],
    "System": ["run_command"],
    "Utility": ["get_current_time", "wait"]
  };

  for (const [category, categoryTools] of Object.entries(categories)) {
    console.log(`\n🔧 ${category}:`);
    for (const toolName of categoryTools) {
      if (tools[toolName]) {
        console.log(`   ✅ ${toolName} - ${tools[toolName].description}`);
      }
    }
  }

  // Test some of the new tools quickly
  console.log("\n🧪 Quick tool tests:");

  // Test get_current_time
  const timeResult = await tools.get_current_time.execute({ format: "readable" });
  console.log(`   ✅ get_current_time: ${timeResult.current_time}`);

  // Test search_files
  const searchResult = await tools.search_files.execute({ pattern: "*.ts", directory: "." });
  console.log(`   ✅ search_files: found ${searchResult.count} TypeScript files`);

  // Test wait (short wait)
  const waitResult = await tools.wait.execute({ seconds: 0.1 });
  console.log(`   ✅ wait: waited ${waitResult.actual.toFixed(3)} seconds`);

  // Test fetch_text with a simple endpoint
  try {
    const fetchResult = await tools.fetch_text.execute({ url: "https://httpbin.org/user-agent" });
    console.log(`   ✅ fetch_text: fetched ${fetchResult.length} characters`);
  } catch (error) {
    console.log(`   ⚠️ fetch_text: skipped (${(error as Error).message})`);
  }

  console.log(`\n✅ AgentV2 now has ${toolNames.length} native tools ready for agents!`);

  // Verify all tools have required properties
  for (const [name, tool] of Object.entries(tools)) {
    assert(tool.key === name, `Tool ${name} key mismatch`);
    assert(typeof tool.execute === "function", `Tool ${name} missing execute function`);
    assert(typeof tool.description === "string", `Tool ${name} missing description`);
  }
});

// Test the new database initialization system
Deno.test("AgentV2 Database Initialization Test", async () => {
  console.log("\n💾 Testing database initialization system...");

  try {
    // Test that we can get the database instance after initialization
    const dbInstance = await createDatabase({
      url: ":memory:",
    });
    console.log("✅ Database instance retrieved successfully");
    assert(dbInstance !== null);

    // Test a simple database operation
    const [testQuery] = await dbInstance
      .select()
      .from(queue)
      .limit(1);

    console.log("✅ Database query executed successfully");

    console.log("🎉 Database initialization tests passed!");

  } catch (error) {
    console.error("❌ Database initialization test failed:", error);
    throw error;
  }
});
