# Programmatic Agents and Callback Interceptors

This document explains the new advanced features added to the agent system: **Programmatic Agents** and **Callback Interceptors**.

## Table of Contents
- [Overview](#overview)
- [Programmatic Agents](#programmatic-agents)
- [Callback Interceptors](#callback-interceptors)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

## Overview

The agent system now supports two powerful new features that make it more flexible and customizable:

1. **Programmatic Agents**: Agents that use custom processing functions instead of LLM calls
2. **Callback Interceptors**: The ability to modify agent responses and behavior through callbacks

These features allow you to:
- Create deterministic agents for specific tasks (calculators, APIs, etc.)
- Modify agent responses in real-time
- Mix programmatic and AI-powered agents in the same system
- Implement complex business logic and validation

## Programmatic Agents

### What are Programmatic Agents?

Programmatic agents are agents that use custom JavaScript/TypeScript functions instead of LLM calls to process messages. They're perfect for:

- **Deterministic operations**: Math calculations, data transformations
- **API integrations**: Weather services, database queries, external APIs
- **Business logic**: Custom workflows, validation rules
- **Performance-critical tasks**: Fast responses without LLM overhead
- **Hybrid approaches**: Sometimes programmatic, sometimes LLM-based

### Creating a Programmatic Agent

To create a programmatic agent, set `agentType: "programmatic"` and provide a `processingFunction`:

```typescript
import { AgentConfig, ProgrammaticAgentInput, ProgrammaticAgentOutput } from "../index.ts";

const calculatorAgent: AgentConfig = {
    name: "Calculator",
    role: "Mathematical Calculator", 
    description: "Performs mathematical calculations",
    personality: "Precise and analytical",
    instructions: "Calculate mathematical expressions",
    agentType: "programmatic", // Makes it programmatic
    processingFunction: async (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> => {
        const { message, context, chatContext } = input;
        
        // Your custom logic here
        const result = evaluateMathExpression(message.content);
        
        return {
            content: `The answer is: ${result}`,
            shouldContinue: true // Continue processing in queue
        };
    }
};
```

### Processing Function Interface

The `processingFunction` receives a `ProgrammaticAgentInput` object:

```typescript
interface ProgrammaticAgentInput {
    message: NewMessage;           // The incoming message
    context: MessageProcessingContext; // Thread, history, tools, etc.
    chatContext: ChatContext;      // Full chat configuration
}
```

And returns a `ProgrammaticAgentOutput`:

```typescript
interface ProgrammaticAgentOutput {
    content?: string;              // Response message (optional)
    toolCalls?: any[];            // Tool calls to execute (optional)
    shouldContinue?: boolean;     // Whether to continue processing (default: true)
}
```

### Programmatic Agents with Tool Calls

Programmatic agents can also call tools:

```typescript
const apiAgent: AgentConfig = {
    name: "WeatherAPI",
    agentType: "programmatic",
    allowedTools: ["http_request"],
    processingFunction: async (input) => {
        const city = extractCityFromMessage(input.message.content);
        
        return {
            content: `Looking up weather for ${city}...`,
            toolCalls: [{
                id: "weather_call_1",
                type: "function",
                function: {
                    name: "http_request",
                    arguments: {
                        url: `https://api.weather.com/v1/current?city=${city}`,
                        method: "GET"
                    }
                }
            }]
        };
    }
};
```

## Callback Interceptors

### What are Callback Interceptors?

Callback interceptors allow you to modify agent behavior at various points in the processing pipeline. When a callback returns an object with an `override` property, the system uses the intercepted value instead of the original.

### How Interceptor Callbacks Work

1. **Standard Callback**: Returns `void` or `undefined` - no interception
2. **Interceptor Callback**: Returns `{ override: newValue }` - value is intercepted
3. **Interception Notification**: The `onInterceptor` callback is triggered when interceptions occur

### Available Interception Points

You can intercept data at these callback points:

- `onMessageReceived`: Modify incoming messages before processing
- `onLLMCompleted`: Modify LLM responses before they're used
- `onMessageSent`: Modify outgoing messages before they're saved
- `onToolCalling`: Modify tool inputs before execution
- `onToolCompleted`: Modify tool outputs after execution

### Interceptor Callback Example

```typescript
import { ChatCallbacks, LLMCompletedData, MessageSentData } from "../index.ts";

const callbacksWithInterceptors: ChatCallbacks = {
    // Intercept LLM responses
    onLLMCompleted: async (data: LLMCompletedData) => {
        // Add emoji to responses from specific agents
        if (data.agentName === "FriendlyBot" && data.llmResponse?.answer) {
            return {
                override: {
                    ...data,
                    llmResponse: {
                        ...data.llmResponse,
                        answer: `😊 ${data.llmResponse.answer} 😊`
                    }
                }
            };
        }
        // No interception
        return undefined;
    },

    // Intercept message content
    onMessageSent: async (data: MessageSentData) => {
        // Convert calculator responses to uppercase
        if (data.senderId === "Calculator") {
            return {
                override: {
                    ...data,
                    content: data.content.toUpperCase()
                }
            };
        }
        return undefined;
    },

    // Log all interceptions
    onInterceptor: async (data) => {
        console.log(`Interception in ${data.callbackType} for ${data.agentName}`);
    }
};
```

### Interceptor Callback Return Types

Each callback can return a response with an override:

```typescript
// Example for onLLMCompleted
interface LLMCompletedResponse extends InterceptorResponse<LLMCompletedData> {
    override?: LLMCompletedData; // Optional override
}

// Usage
onLLMCompleted: async (data: LLMCompletedData): Promise<LLMCompletedResponse | void> => {
    if (shouldIntercept(data)) {
        return { override: modifiedData };
    }
    // Return nothing or undefined for no interception
}
```

## Examples

### Example 1: Simple Calculator Agent

```typescript
const calculatorAgent: AgentConfig = {
    name: "Calculator",
    role: "Mathematical Calculator",
    agentType: "programmatic",
    processingFunction: async (input) => {
        const content = input.message.content || "";
        const mathMatch = content.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
        
        if (mathMatch) {
            const [, a, op, b] = mathMatch;
            const num1 = parseInt(a), num2 = parseInt(b);
            
            let result: number;
            switch (op) {
                case '+': result = num1 + num2; break;
                case '-': result = num1 - num2; break;
                case '*': result = num1 * num2; break;
                case '/': result = num1 / num2; break;
                default: throw new Error('Invalid operation');
            }
            
            return { content: `${num1} ${op} ${num2} = ${result}` };
        }
        
        return { content: "Please provide a math expression like '5 + 3'" };
    }
};
```

### Example 2: Content Moderation Interceptor

```typescript
const moderationCallbacks: ChatCallbacks = {
    onMessageSent: async (data) => {
        // Filter inappropriate content
        const inappropriateWords = ['badword1', 'badword2'];
        let cleanContent = data.content;
        
        inappropriateWords.forEach(word => {
            cleanContent = cleanContent.replace(new RegExp(word, 'gi'), '***');
        });
        
        if (cleanContent !== data.content) {
            return {
                override: {
                    ...data,
                    content: cleanContent
                }
            };
        }
        
        return undefined;
    },

    onOverride: async (data) => {
        if (data.callbackType === 'onMessageSent') {
            console.log('Content moderation applied');
        }
    }
};
```

### Example 3: Hybrid Agent (Sometimes Programmatic, Sometimes LLM)

```typescript
const hybridAgent: AgentConfig = {
    name: "HybridBot",
    agentType: "programmatic",
    llmOptions: { provider: "openai", model: "gpt-4" },
    processingFunction: async (input) => {
        const content = input.message.content || "";
        
        // Handle simple queries programmatically
        if (content.toLowerCase().includes("time")) {
            return { content: `Current time: ${new Date().toLocaleString()}` };
        }
        
        // For complex queries, use LLM (would need to import chat function)
        // const llmResponse = await chat({...});
        // return { content: llmResponse.answer };
        
        return { content: "Complex query - would use LLM in full implementation" };
    }
};
```

## Best Practices

### For Programmatic Agents

1. **Error Handling**: Always wrap your logic in try-catch blocks
2. **Input Validation**: Validate message content before processing
3. **Performance**: Use programmatic agents for fast, deterministic operations
4. **Fallback**: Consider hybrid approaches for complex scenarios
5. **Tool Integration**: Leverage existing tools in your processing functions

```typescript
processingFunction: async (input) => {
    try {
        // Validate input
        if (!input.message.content) {
            return { content: "Please provide a message" };
        }
        
        // Process safely
        const result = await processLogic(input.message.content);
        return { content: result };
        
    } catch (error) {
        console.error('Processing error:', error);
        return { content: "Sorry, I encountered an error processing your request" };
    }
}
```

### For Callback Overrides

1. **Selective Overriding**: Only override when necessary to avoid performance issues
2. **Data Integrity**: Ensure overridden data maintains the expected format
3. **Logging**: Use `onOverride` callback to track when overrides occur
4. **Testing**: Test both override and non-override scenarios
5. **Documentation**: Document your override logic for team members

```typescript
onLLMCompleted: async (data) => {
    // Only override specific agents or conditions
    if (data.agentName === "SpecialBot" && shouldApplyCustomLogic(data)) {
        const modifiedResponse = applyCustomLogic(data);
        
        // Validate the override maintains required structure
        if (isValidLLMResponse(modifiedResponse)) {
            return { override: modifiedResponse };
        }
    }
    
    return undefined; // No override
}
```

## Migration Guide

### From Standard Agents to Programmatic Agents

1. **Identify Suitable Agents**: Look for agents doing deterministic tasks
2. **Extract Logic**: Move business logic from system prompts to functions
3. **Add Error Handling**: Wrap logic in proper error handling
4. **Test Thoroughly**: Ensure programmatic logic matches expected behavior

Before:
```typescript
const agent: AgentConfig = {
    name: "Calculator",
    instructions: "You are a calculator. When given math expressions, calculate them and return the result.",
    llmOptions: { provider: "openai", model: "gpt-4" }
};
```

After:
```typescript
const agent: AgentConfig = {
    name: "Calculator", 
    agentType: "programmatic",
    processingFunction: async (input) => {
        // Direct calculation logic
        return { content: calculateMath(input.message.content) };
    }
};
```

### Adding Overrides to Existing Systems

1. **Start Small**: Begin with logging-only callbacks
2. **Identify Override Points**: Determine where modifications are needed
3. **Implement Gradually**: Add overrides one callback at a time
4. **Monitor Impact**: Track performance and behavior changes

```typescript
// Start with logging
const callbacks: ChatCallbacks = {
    onLLMCompleted: async (data) => {
        console.log(`LLM completed for ${data.agentName}`);
        // No overrides initially
    },
    
    onOverride: async (data) => {
        console.log('Override occurred:', data);
    }
};

// Then add selective overrides
const callbacksWithOverrides: ChatCallbacks = {
    ...callbacks,
    onLLMCompleted: async (data) => {
        console.log(`LLM completed for ${data.agentName}`);
        
        // Add overrides for specific cases
        if (data.agentName === "TestAgent") {
            return { override: modifyResponse(data) };
        }
    }
};
```

## API Reference

### Types

```typescript
type AgentType = "agentic" | "programmatic";

interface ProgrammaticProcessingFunction {
    (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> | ProgrammaticAgentOutput;
}

interface ProgrammaticAgentInput {
    message: NewMessage;
    context: MessageProcessingContext;
    chatContext: ChatContext;
}

interface ProgrammaticAgentOutput {
    content?: string;
    toolCalls?: any[];
    shouldContinue?: boolean;
}

interface CallbackResponse<T = any> {
    override?: T;
}

interface CallbackOverrideData {
    threadId: string;
    agentName: string;
    callbackType: string;
    originalValue: any;
    overriddenValue: any;
    timestamp: Date;
}
```

### Enhanced AgentConfig

```typescript
interface AgentConfig {
    // ... existing fields
    agentType?: AgentType; // "agentic" | "programmatic"
    processingFunction?: ProgrammaticProcessingFunction; // For programmatic agents
}
```

### Enhanced ChatCallbacks

```typescript
interface ChatCallbacks {
    onToolCalling?: (data: ToolCallingData) => void | Promise<void> | ToolCallingResponse | Promise<ToolCallingResponse>;
    onToolCompleted?: (data: ToolCompletedData) => void | Promise<void> | ToolCompletedResponse | Promise<ToolCompletedResponse>;
    onMessageReceived?: (data: MessageReceivedData) => void | Promise<void> | MessageReceivedResponse | Promise<MessageReceivedResponse>;
    onMessageSent?: (data: MessageSentData) => void | Promise<void> | MessageSentResponse | Promise<MessageSentResponse>;
    onTokenStream?: (data: TokenStreamData) => void | Promise<void>;
    onLLMCompleted?: (data: LLMCompletedData) => void | Promise<void> | LLMCompletedResponse | Promise<LLMCompletedResponse>;
    onOverride?: (data: CallbackOverrideData) => void | Promise<void>; // New callback
}
```

This completes the implementation of programmatic agents and callback overrides! The system now supports both deterministic programmatic agents and flexible response modification through callbacks. 