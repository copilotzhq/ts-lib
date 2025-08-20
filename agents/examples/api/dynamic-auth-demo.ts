#!/usr/bin/env -S deno run -A

/**
 * Dynamic Authentication Demo
 * 
 * This demonstrates how to use dynamic authentication with a mock API
 * that requires login to get a token for subsequent requests.
 */

import { runCLI, AgentConfig, APIConfig, DynamicAuth } from "../../index.ts";

// Mock API schema that requires dynamic authentication
const mockApiSchema = {
    openapi: "3.0.0",
    info: { title: "Mock Secure API", version: "1.0.0" },
    servers: [{ url: "https://jsonplaceholder.typicode.com" }], // Using a public API for demo
    paths: {
        "/posts": {
            get: {
                operationId: "getPosts",
                summary: "Get all posts (requires auth)",
                responses: { "200": { description: "List of posts" } }
            }
        },
        "/users": {
            get: {
                operationId: "getUsers", 
                summary: "Get all users (requires auth)",
                responses: { "200": { description: "List of users" } }
            }
        }
    }
};

// Example: JWT Authentication with Auto-Refresh
const jwtAuthConfig: APIConfig = {
    name: "mock-jwt-api",
    description: "Mock API with JWT authentication",
    openApiSchema: mockApiSchema,
    auth: {
        type: 'dynamic',
        authEndpoint: {
            url: '/auth/login', // This would be your real auth endpoint
            method: 'POST',
            credentials: {
                username: 'demo-user',
                password: 'demo-password'
            }
        },
        tokenExtraction: {
            path: 'access_token', // Extract from response.access_token
            type: 'bearer'
        },
        refreshConfig: {
            refreshPath: 'refresh_token',
            refreshEndpoint: '/auth/refresh',
            expiryPath: 'expires_in',
            refreshBeforeExpiry: 300 // Refresh 5 minutes before expiry
        },
        cache: {
            enabled: true,
            duration: 3600 // 1 hour default cache
        }
    } as DynamicAuth,
    timeout: 30
};

// Create an agent that can use the authenticated API
const secureApiAgent: AgentConfig = {
    name: "SecureApiAgent",
    role: "API Data Analyst", 
    description: "I can access secured APIs using dynamic authentication",
    instructions: `
        You have access to a secure API that requires authentication.
        The authentication is handled automatically - you just need to call the available tools.
        
        Available operations:
        - getPosts: Get all posts from the API
        - getUsers: Get all users from the API
        
        When asked about data, use these tools to fetch and analyze the information.
    `,
    allowedTools: [
        "getPosts",
        "getUsers"
    ],
    llmOptions: {
        provider: "openai", 
        model: "gpt-4o",
        temperature: 0.3
    }
};



// Main execution
if (import.meta.main) {
    await runCLI(
        {
            initialMessage: {
                content: "Please get some posts from the secure API and tell me about them.",
                senderId: "user",
                participants: ["SecureApiAgent"]
            },
            participants: ["SecureApiAgent"],
            agents: [secureApiAgent],
            apis: [jwtAuthConfig],
        }
    );
} 