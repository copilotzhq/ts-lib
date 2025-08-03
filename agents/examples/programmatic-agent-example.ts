import type { 
    AgentConfig, 
    ChatCallbacks, 
    ProgrammaticAgentInput, 
    ProgrammaticAgentOutput,
    InterceptorData,
    MessageSentData,
    LLMCompletedData
} from "../index.ts";

import { createThread } from "../threads/index.ts";

/**
 * Example: Programmatic Agent with Custom Processing Logic
 * 
 * This example demonstrates:
 * 1. Creating a programmatic agent that doesn't use LLM
 * 2. Using callback interceptors to modify agent responses
 * 3. Mixing programmatic and agentic agents in the same system
 */

// Example 1: Simple Programmatic Agent (Calculator)
const calculatorAgent: AgentConfig = {
    name: "Calculator",
    role: "Mathematical Calculator",
    description: "Performs mathematical calculations programmatically",
    personality: "Precise and analytical",
    instructions: "Calculate mathematical expressions",
    agentType: "programmatic", // This makes it a programmatic agent
    processingFunction: async (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> => {
        const { message } = input;
        const content = message.content || "";
        
        // Simple math expression evaluation (in real use, use a safe math parser)
        try {
            // Extract numbers and basic operations
            const mathMatch = content.match(/(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)/);
            
            if (mathMatch) {
                const [, num1, operator, num2] = mathMatch;
                const a = parseFloat(num1);
                const b = parseFloat(num2);
                
                let result: number;
                switch (operator) {
                    case '+': result = a + b; break;
                    case '-': result = a - b; break;
                    case '*': result = a * b; break;
                    case '/': result = b !== 0 ? a / b : NaN; break;
                    default: throw new Error('Unsupported operation');
                }
                
                return {
                    content: `The answer is: ${result}`,
                    shouldContinue: true
                };
            } else {
                return {
                    content: "I can help you with basic math. Try something like '5 + 3' or '10 * 2'",
                    shouldContinue: true
                };
            }
        } catch (error) {
            return {
                content: `Math error: ${error}`,
                shouldContinue: true
            };
        }
    }
};

// Example 2: Programmatic Agent with Tool Calls
const weatherApiAgent: AgentConfig = {
    name: "WeatherAPI",
    role: "Weather Information Provider",
    description: "Provides weather information using programmatic logic",
    personality: "Informative and helpful",
    instructions: "Provide weather information",
    agentType: "programmatic",
    allowedTools: ["http_request"], // Can use tools
    processingFunction: async (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> => {
        const { message } = input;
        const content = message.content || "";
        
        // Look for city names in the message
        const cityMatch = content.match(/weather in ([a-zA-Z\s]+)/i);
        
        if (cityMatch) {
            const city = cityMatch[1].trim();
            
            // Return tool calls to fetch weather data
            return {
                content: `Looking up weather for ${city}...`,
                toolCalls: [{
                    id: "weather_call_1",
                    type: "function",
                    function: {
                        name: "http_request",
                        arguments: {
                            url: `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=YOUR_API_KEY&units=metric`,
                            method: "GET"
                        }
                    }
                }],
                shouldContinue: true
            };
        } else {
            return {
                content: "Ask me about the weather in a specific city, like 'What's the weather in London?'",
                shouldContinue: true
            };
        }
    }
};

// Example 3: Standard Agentic Agent for comparison
const chatAgent: AgentConfig = {
    name: "ChatBot",
    role: "Conversational Assistant", 
    description: "General purpose chat assistant",
    personality: "Friendly and helpful",
    instructions: "Have natural conversations and help users with various topics",
    agentType: "agentic", // Standard LLM-powered agent (this is the default)
    llmOptions: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7
    }
};

// Example 4: Callback Interceptors for Response Modification
const callbacksWithInterceptors: ChatCallbacks = {
    // Intercept LLM responses to add custom formatting
    onLLMCompleted: async (data: LLMCompletedData) => {
        console.log(`🤖 Agent ${data.agentName} completed LLM call`);
        
        // Example: Add emoji to all responses from ChatBot
        if (data.agentName === "ChatBot" && data.llmResponse?.answer) {
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
        
        // No interception - return undefined (or don't return anything)
        return undefined;
    },

    // Intercept message content before sending
    onMessageSent: async (data: MessageSentData) => {
        console.log(`📤 Message sent by ${data.senderId}: ${data.content.substring(0, 50)}...`);
        
        // Example: Convert all responses to uppercase for Calculator agent
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
    onIntercepted: async (data: InterceptorData) => {
        console.log(`🔄 Interceptor triggered:`, {
            agent: data.agentName,
            callback: data.callbackType,
            timestamp: data.timestamp
        });
        console.log(`   Original:`, data.originalValue);
        console.log(`   Intercepted:`, data.interceptedValue);
    },

    // Standard callbacks work as before
    onMessageReceived: async (data) => {
        console.log(`📥 Received: ${data.content}`);
    },

    onToolCalling: async (data) => {
        console.log(`🔧 Calling tool: ${data.toolName}`);
    },

    onToolCompleted: async (data) => {
        console.log(`✅ Tool completed: ${data.toolName}`);
    }
};

// Example Usage
export async function runProgrammaticAgentExample() {
    console.log("🚀 Starting Programmatic Agent Example\n");

    const agents = [calculatorAgent, weatherApiAgent, chatAgent];
    
    // Example conversation 1: Test calculator
    console.log("--- Testing Calculator Agent ---");
    await createThread(
        {
            content: "@Calculator what is 15 + 27?",
            threadName: "Math Test"
        },
        {
            agents,
            tools: [], // Add your tools here
            callbacks: callbacksWithInterceptors,
            stream: true
        }
    );

    // Example conversation 2: Test weather agent
    console.log("\n--- Testing Weather Agent ---");
    await createThread(
        {
            content: "@WeatherAPI what's the weather in London?",
            threadName: "Weather Test"
        },
        {
            agents,
            tools: [], // Add your tools here
            callbacks: callbacksWithInterceptors,
            stream: true
        }
    );

    // Example conversation 3: Test standard chat agent with interceptors
    console.log("\n--- Testing Chat Agent with Interceptors ---");
    await createThread(
        {
            content: "@ChatBot tell me a joke",
            threadName: "Chat Test"
        },
        {
            agents,
            tools: [], // Add your tools here
            callbacks: callbacksWithInterceptors,
            stream: true
        }
    );

    // Example conversation 4: Multi-agent conversation
    console.log("\n--- Multi-Agent Conversation ---");
    await createThread(
        {
            content: "Hello everyone! Can someone calculate 10 * 5 and someone else tell me about the weather?",
            threadName: "Multi-Agent Test",
            participants: ["Calculator", "WeatherAPI", "ChatBot"] // All agents can participate
        },
        {
            agents,
            tools: [], // Add your tools here  
            callbacks: callbacksWithInterceptors,
            stream: true
        }
    );
}

// Advanced Example: Conditional Programmatic Agent
const conditionalAgent: AgentConfig = {
    name: "ConditionalBot",
    role: "Conditional Response Agent",
    description: "Sometimes uses LLM, sometimes programmatic logic",
    personality: "Adaptive and intelligent",
    instructions: "Use the best approach for each type of question",
    agentType: "programmatic",
    llmOptions: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7
    },
    processingFunction: async (input: ProgrammaticAgentInput): Promise<ProgrammaticAgentOutput> => {
        const { message, context, chatContext } = input;
        const content = message.content || "";
        
        // Use programmatic logic for simple queries
        if (content.toLowerCase().includes("hello") || content.toLowerCase().includes("hi")) {
            return {
                content: "Hello! I'm ConditionalBot. I can handle simple greetings programmatically or use AI for complex questions.",
                shouldContinue: true
            };
        }
        
        // Use programmatic logic for time queries
        if (content.toLowerCase().includes("time") || content.toLowerCase().includes("date")) {
            const now = new Date();
            return {
                content: `The current time is ${now.toLocaleString()}`,
                shouldContinue: true
            };
        }
        
        // For complex queries, we could call the LLM directly
        // (This would require importing and using the LLM functions)
        // For now, just return a programmatic response
        return {
            content: "This is a complex question that I'm handling programmatically for now. In a full implementation, I could switch to LLM mode here.",
            shouldContinue: true
        };
    }
};

export { 
    calculatorAgent, 
    weatherApiAgent, 
    chatAgent, 
    conditionalAgent,
    callbacksWithInterceptors 
}; 