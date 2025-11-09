import { defineSchema, type JsonSchema } from "omnipg";
import type { FromSchema } from "npm:json-schema-to-ts@3.1.1";

const UUID_SCHEMA: JsonSchema = {
  type: "string",
  format: "uuid",
};

const ISO_DATETIME_SCHEMA: JsonSchema = {
  type: "string",
  format: "date-time",
};

const READONLY_UUID_SCHEMA: JsonSchema = {
  ...UUID_SCHEMA,
  readOnly: true,
};

const READONLY_TIMESTAMP_SCHEMA: JsonSchema = {
  ...ISO_DATETIME_SCHEMA,
  readOnly: true,
};

const TIMESTAMP_COLUMNS = {
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

const JSON_ANY_SCHEMA: JsonSchema = {
  anyOf: [
    { type: "object" },
    { type: "array" },
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};

// Standalone JSON Schemas for queue payloads (so we can reuse their TS types)
export const ToolMessageMetadataSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    toolName: { type: "string" },
    arguments: { type: "string" },
    // Allow any JSON for output/error
    output: {},
    error: {},
  },
} as const;

export const NewMessageEventPayloadSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    senderId: { type: "string" },
    senderType: {
      type: "string",
      enum: ["user", "agent", "tool", "system"],
    },
    content: { anyOf: [{ type: "string" }, { type: "null" }] },
    toolCallId: { anyOf: [{ type: "string" }, { type: "null" }] },
    toolCalls: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              id: { anyOf: [{ type: "string" }, { type: "null" }] },
              function: {
                type: "object",
                additionalProperties: true,
                properties: {
                  name: { type: "string" },
                  arguments: { type: "string" },
                },
                required: ["name", "arguments"],
              },
            },
          },
        },
      ],
    },
    metadata: {
      anyOf: [
        { $ref: "#/$defs/ToolMessageMetadata" },
        { type: "object" },
        { type: "null" },
      ],
    },
  },
  required: ["senderId", "senderType"],
} as const;

export type NewMessageEventPayload = FromSchema<typeof NewMessageEventPayloadSchema>;

const schemas = defineSchema({
  agents: {
    schema: {
      type: "object",
      additionalProperties: false,
      $defs: {
        ProviderName: {
          type: "string",
          enum: ["openai", "anthropic", "gemini", "groq", "deepseek", "ollama", "xai"],
        },
        ProviderConfig: {
          type: "object",
          additionalProperties: true,
          properties: {
            provider: { $ref: "#/$defs/ProviderName" },
            apiKey: { type: "string" },
            model: { type: "string" },
            temperature: { type: "number" },
            maxTokens: { type: "number" },
            maxCompletionTokens: { type: "number" },
            maxLength: { type: "number" },
            responseType: { type: "string", enum: ["text", "json"] },
            stream: { type: "boolean" },
            topP: { type: "number" },
            topK: { type: "number" },
            presencePenalty: { type: "number" },
            frequencyPenalty: { type: "number" },
            stop: {
              anyOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            stopSequences: {
              type: "array",
              items: { type: "string" },
            },
            seed: { type: "number" },
            baseUrl: { type: "string" },
            candidateCount: { type: "number" }, // Gemini
            responseMimeType: { type: "string" }, // Gemini JSON format
            repeatPenalty: { type: "number" }, // Ollama
            numCtx: { type: "number" }, // Ollama context window
            metadata: { type: "object" }, // Anthropic
            reasoningEffort: {
              type: "string",
              enum: ["minimal", "low", "medium", "high"], // OpenAI reasoning models
            },
            user: { type: "string" }, // OpenAI user identifier
            verbosity: {
              type: "string",
              enum: ["none", "low", "medium", "high"], // OpenAI reasoning
            },
          },
        },
      },
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        role: { type: "string" },
        personality: { type: ["string", "null"] },
        instructions: { type: ["string", "null"] },
        description: { type: ["string", "null"] },
        agentType: {
          type: "string",
          enum: ["agentic", "programmatic"],
          default: "agentic",
        },
        allowedAgents: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        allowedTools: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        llmOptions: {
          anyOf: [
            { $ref: "#/$defs/ProviderConfig" },
            { type: "null" },
          ],
        },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "role", "agentType"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    }
  },
  apis: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        description: { type: ["string", "null"] },
        openApiSchema: { type: ["object", "null"] },
        baseUrl: { type: ["string", "null"] },
        headers: { type: ["object", "null"] },
        auth: { type: ["object", "null"] },
        timeout: { type: ["integer", "null"] },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    }
  },
  mcpServers: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        description: { type: ["string", "null"] },
        transport: { type: ["object", "null"] },
        capabilities: { type: ["object", "null"] },
        env: { type: ["object", "null"] },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    }
  },
  messages: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        threadId: { $ref: "#/$defs/threads/properties/id" },
        senderUserId: {
          anyOf: [
            UUID_SCHEMA,
            { type: "null" },
          ],
        },
        senderId: { type: "string" },
        senderType: {
          type: "string",
          enum: ["agent", "user", "system", "tool"],
        },
        thread: {
          readOnly: true,
          anyOf: [
            { $ref: "#/$defs/threads" },
            { type: "null" },
          ],
        },
        externalId: { type: ["string", "null"], maxLength: 255 },
        content: { type: ["string", "null"] },
        toolCallId: { type: ["string", "null"], maxLength: 255 },
        toolCalls: { type: ["array", "null"], items: JSON_ANY_SCHEMA },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "id",
        "threadId",
        "senderId",
        "senderType",
      ],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    }
  },
  queue: {
    schema: {
      type: "object",
      additionalProperties: false,
      $defs: {
        ChatContentPart: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { const: "text" },
                text: { type: "string" },
              },
              required: ["type", "text"],
            },
            {
              type: "object",
              additionalProperties: true,
              properties: {
                type: { type: "string" },
              },
              required: ["type"],
            },
          ],
        },
        ChatMessage: {
          type: "object",
          additionalProperties: true,
          properties: {
            role: {
              type: "string",
              enum: ["system", "user", "assistant", "tool", "tool_result"],
            },
            content: {
              anyOf: [
                { type: "string" },
                {
                  type: "array",
                  items: { $ref: "#/$defs/ChatContentPart" },
                },
              ],
            },
            tool_call_id: { type: ["string", "null"] },
            toolCalls: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
          required: ["role", "content"],
        },
        ToolDefinition: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { const: "function" },
            function: {
              type: "object",
              additionalProperties: true,
              properties: {
                name: { type: "string" },
                description: { type: ["string", "null"] },
                parameters: { type: ["object", "null"] },
              },
              required: ["name"],
            },
          },
          required: ["type", "function"],
        },
        ToolMessageMetadata: ToolMessageMetadataSchema,
        ToolCallEventPayload: {
          type: "object",
          additionalProperties: false,
          properties: {
            agentName: { type: "string" },
            senderId: { type: "string" },
            senderType: { const: "agent" },
            call: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: ["string", "null"] },
                function: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    arguments: { type: "string" },
                  },
                  required: ["name", "arguments"],
                },
              },
              required: ["function"],
            },
          },
          required: ["agentName", "senderId", "senderType", "call"],
        },
        NewMessageEventPayload: NewMessageEventPayloadSchema,
        LlmCallEventPayload: {
          type: "object",
          additionalProperties: false,
          properties: {
            agentName: { type: "string" },
            agentId: { type: "string" },
            messages: {
              type: "array",
              items: { $ref: "#/$defs/ChatMessage" },
              minItems: 1,
            },
            tools: {
              type: "array",
              items: { $ref: "#/$defs/ToolDefinition" },
            },
            config: { type: "object" },
          },
          required: ["agentName", "agentId", "messages", "tools", "config"],
        },
      },
      properties: {
        id: READONLY_UUID_SCHEMA,
        threadId: { $ref: "#/$defs/threads/properties/id" },
        eventType: {
          type: "string",
          enum: ["NEW_MESSAGE", "TOOL_CALL", "LLM_CALL"],
        },
        payload: { type: "object" },
        thread: {
          readOnly: true,
          anyOf: [
            { $ref: "#/$defs/threads" },
            { type: "null" },
          ],
        },
        parentEventId: {
          anyOf: [
            UUID_SCHEMA,
            { type: "null" },
          ],
        },
        parentEvent: {
          readOnly: true,
          anyOf: [
            { type: "object" },
            { type: "null" },
          ],
        },
        traceId: { type: ["string", "null"], maxLength: 255 },
        priority: { type: ["integer", "null"] },
        ttlMs: { type: ["integer", "null"] },
        expiresAt: { type: ["string", "null"], format: "date-time" },
        status: {
          type: "string",
          enum: [
            "pending",
            "processing",
            "completed",
            "failed",
            "expired",
            "overwritten",
          ],
          default: "pending",
        },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "id",
        "threadId",
        "eventType",
        "payload",
        "status",
      ],
      allOf: [
        {
          if: {
            properties: { eventType: { const: "NEW_MESSAGE" } },
          },
          then: {
            properties: {
              payload: { $ref: "#/$defs/NewMessageEventPayload" },
            },
          },
        },
        {
          if: {
            properties: { eventType: { const: "TOOL_CALL" } },
          },
          then: {
            properties: {
              payload: { $ref: "#/$defs/ToolCallEventPayload" },
            },
          },
        },
        {
          if: {
            properties: { eventType: { const: "LLM_CALL" } },
          },
          then: {
            properties: {
              payload: { $ref: "#/$defs/LlmCallEventPayload" },
            },
          },
        },
      ],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    }
  },
  tasks: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        goal: { type: "string" },
        successCriteria: { type: ["string", "null"] },
        status: { type: "string", default: "pending" },
        notes: { type: ["string", "null"] },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "goal", "status"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    },
  },
  threads: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        description: { type: ["string", "null"] },
        participants: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        initialMessage: { type: ["string", "null"] },
        mode: { type: "string", default: "immediate" },
        status: { type: "string", default: "active" },
        summary: { type: ["string", "null"] },
        parentThreadId: {
          anyOf: [
            UUID_SCHEMA,
            { type: "null" },
          ],
        },
        parentThread: {
          readOnly: true,
          anyOf: [
            { type: "object" },
            { type: "null" },
          ],
        },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "name", "mode", "status"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: () => crypto.randomUUID(),
    },
  },
  tools: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        key: { type: "string", minLength: 1 },
        name: { type: "string", minLength: 1 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        description: { type: "string" },
        inputSchema: { type: ["object", "null"] },
        outputSchema: { type: ["object", "null"] },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "key", "name", "description"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: crypto.randomUUID(),
    }
  },
  users: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: READONLY_UUID_SCHEMA,
        name: { type: ["string", "null"], maxLength: 255 },
        email: { type: ["string", "null"], maxLength: 255 },
        externalId: { type: ["string", "null"], maxLength: 255 },
        metadata: { type: ["object", "null"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id"],
    },
    keys: [{ property: "id" }],
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    defaults: {
      id: crypto.randomUUID(),
    }
  },
});

const agents = schemas.agents;
const apis = schemas.apis;
const mcpServers = schemas.mcpServers;
const messages = schemas.messages;
const queue = schemas.queue;
const tasks = schemas.tasks;
const threads = schemas.threads;
const tools = schemas.tools;
const users = schemas.users;


export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type API = typeof apis.$inferSelect;
export type NewAPI = typeof apis.$inferInsert;

export type MCPServer = typeof mcpServers.$inferSelect;
export type NewMCPServer = typeof mcpServers.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Queue = typeof queue.$inferSelect;
export type NewQueue = typeof queue.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const schema = schemas;

export type MessagePayload = Omit<
  NewMessage,
  "id" | "threadId" | "senderUserId" | "createdAt" | "updatedAt"
>;

type EventType = Queue["eventType"];

export type Event = Omit<Queue, "eventType"> & { type: EventType };
export type NewEvent = Omit<
  NewQueue,
  "eventType" | "id" | "createdAt" | "updatedAt" | "status"
> & {
  type: EventType;
  id?: string;
  status?: Queue["status"];
  createdAt?: string;
  updatedAt?: string;
};
