#!/usr/bin/env -S deno run -A

/**
 * Weather Agent Example - API Tools Integration
 * 
 * This example demonstrates how to create an agent that uses API tools
 * generated from an OpenAPI schema. The agent specializes in weather data
 * using the National Weather Service API.
 */

import { createThread, AgentConfig, APIConfig, ChatCallbacks } from "../../index.ts";

// Load the OpenAPI schema for the National Weather Service API
const weatherApiSchema = JSON.parse(
    await Deno.readTextFile(new URL("./weather-api-schema.json", import.meta.url).pathname)
);

// Configure the Weather API
const weatherApiConfig: APIConfig = {
    name: "nws-weather",
    description: "National Weather Service API for US weather data",
    openApiSchema: weatherApiSchema,
    headers: {
        "User-Agent": "CopilotzWeatherApp/1.0 (contact@example.com)",
        "Accept": "application/geo+json"
    },
    timeout: 30 // 30 second timeout
};

// Create a weather specialist agent
const weatherAgent: AgentConfig = {
    name: "WeatherSpecialist",
    role: "Weather Data Analyst",
    description: "I specialize in fetching and analyzing weather data from the National Weather Service",
    personality: "Knowledgeable, accurate, and detail-oriented about weather patterns",
    instructions: `
        You are a weather specialist with access to the National Weather Service API.
        
        When asked about weather:
        1. First get grid point data for the coordinates using getGridPoint
        2. Then get the forecast using getForecast with the grid data
        3. For alerts, use getActiveAlerts with the state code
        4. Always provide clear, formatted weather information
        5. Explain any weather warnings or unusual conditions
        
        Key locations for reference:
        - New York City: 40.7128, -74.0060
        - Los Angeles: 34.0522, -118.2437
        - Chicago: 41.8781, -87.6298
        - Miami: 25.7617, -80.1918
        - Denver: 39.7392, -104.9903
        - Seattle: 47.6062, -122.3321
        
        Always format coordinates as decimal degrees (e.g., 40.7128, -74.0060).
    `,
    allowedTools: [
        // Only weather API tools - generated from OpenAPI schema
        // Using operationId directly since it takes precedence in tool generation
        "getGridPoint",
        "getForecast", 
        "getActiveAlerts"
    ],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o",
        // temperature: 0.1 // Low temperature for factual weather data
    }
};

// Callbacks to monitor weather API calls
const weatherCallbacks: ChatCallbacks = {
    onToolCalling: (data) => {
        console.log(`🌤️  Calling weather API: ${data.toolName}`);
    },
    onToolCompleted: (data) => {
        if (data.error) {
            console.log(`❌ Weather API failed: ${data.toolName} - ${data.error}`);
        } else {
            console.log(`✅ Weather API completed: ${data.toolName} (${data.duration}ms)`);
        }
    },
    onMessageSent: (data) => {
        console.log(`🤖 ${data.senderId}: ${data.content}`);
    }
};

/**
 * Example function to test weather queries
 */
async function testWeatherAgent() {
    console.log("🌦️  Starting Weather Agent Example");
    console.log("==================================\n");

    try {
        const result = await createThread(
            {
                threadId: crypto.randomUUID(),
                content: "What's the weather forecast for Seattle, Washington? Also check if there are any active weather alerts for Washington state.",
                participants: ["WeatherSpecialist"]
            },
            {
                agents: [weatherAgent],
                apis: [weatherApiConfig], // Our Weather API configuration
                callbacks: weatherCallbacks,
                dbConfig: { url: ':memory:' },
                stream: false,
            }
        );
       

    } catch (error) {
        console.error("❌ Weather agent test failed:", error);
    }
}

// Main execution
if (import.meta.main) {

    await testWeatherAgent();

    console.log("\n✨ Weather Agent Example Complete!");
} 