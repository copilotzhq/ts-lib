#!/usr/bin/env -S deno run -A

/**
 * Authentication Examples for API Tools
 * 
 * This example demonstrates how to configure different authentication methods
 * when integrating APIs with agents. It covers all supported authentication types.
 */

import { APIConfig, ApiKeyAuth, BearerAuth, BasicAuth, CustomAuth, DynamicAuth } from "../../Interfaces.ts";
import { generateApiTools } from "../../tools/api-generator.ts";

// Sample OpenAPI schema for testing authentication
const sampleApiSchema = {
    openapi: "3.0.0",
    info: { title: "Sample API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
        "/users": {
            get: {
                operationId: "getUsers",
                summary: "Get all users",
                responses: { "200": { description: "List of users" } }
            }
        },
        "/protected": {
            get: {
                operationId: "getProtectedData",
                summary: "Get protected data",
                responses: { "200": { description: "Protected data" } }
            }
        }
    }
};

/**
 * Example 1: API Key Authentication (Header-based)
 * Common for services like OpenWeatherMap, Stripe, etc.
 */
function createApiKeyHeaderExample(): APIConfig {
    const apiKeyAuth: ApiKeyAuth = {
        type: 'apiKey',
        key: 'your-secret-api-key-here',
        name: 'X-API-Key', // Header name
        in: 'header'
    };

    return {
        name: "api-key-header-service",
        description: "Service that uses API key in headers",
        openApiSchema: sampleApiSchema,
        auth: apiKeyAuth,
        timeout: 30
    };
}

/**
 * Example 2: API Key Authentication (Query Parameter)
 * Common for services like Google APIs, YouTube API, etc.
 */
function createApiKeyQueryExample(): APIConfig {
    const apiKeyAuth: ApiKeyAuth = {
        type: 'apiKey',
        key: 'AIzaSyBOTI52HcCX0fXhgsH4jOjG0FiQMo4a',
        name: 'api_key', // Query parameter name
        in: 'query'
    };

    return {
        name: "api-key-query-service",
        description: "Service that uses API key in query parameters",
        openApiSchema: sampleApiSchema,
        auth: apiKeyAuth,
        timeout: 30
    };
}

/**
 * Example 3: Bearer Token Authentication (OAuth/JWT)
 * Common for services like GitHub API, Discord API, etc.
 */
function createBearerTokenExample(): APIConfig {
    const bearerAuth: BearerAuth = {
        type: 'bearer',
        token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // GitHub personal access token
        scheme: 'Bearer' // Optional - defaults to 'Bearer'
    };

    return {
        name: "bearer-token-service",
        description: "Service that uses Bearer token authentication",
        openApiSchema: sampleApiSchema,
        auth: bearerAuth,
        timeout: 30
    };
}

/**
 * Example 4: Basic Authentication
 * Common for internal APIs, Jenkins, etc.
 */
function createBasicAuthExample(): APIConfig {
    const basicAuth: BasicAuth = {
        type: 'basic',
        username: 'your-username',
        password: 'your-password'
    };

    return {
        name: "basic-auth-service",
        description: "Service that uses Basic authentication",
        openApiSchema: sampleApiSchema,
        auth: basicAuth,
        timeout: 30
    };
}

/**
 * Example 5: Custom Authentication
 * For services with unique authentication requirements
 */
function createCustomAuthExample(): APIConfig {
    const customAuth: CustomAuth = {
        type: 'custom',
        headers: {
            'X-Custom-Auth': 'custom-token-value',
            'X-Client-ID': 'your-client-id',
            'X-Timestamp': Date.now().toString()
        },
        queryParams: {
            'signature': 'generated-signature',
            'version': '2.0'
        }
    };

    return {
        name: "custom-auth-service",
        description: "Service with custom authentication requirements",
        openApiSchema: sampleApiSchema,
        auth: customAuth,
        timeout: 30
    };
}

/**
 * Example 6: Multiple Authentication Methods (Environment-based)
 * Shows how to dynamically choose authentication based on environment
 */
function createEnvironmentBasedAuth(): APIConfig {
    // Get API key from environment variable
    const apiKey = Deno.env.get('API_KEY');
    const bearerToken = Deno.env.get('BEARER_TOKEN');
    
    let auth: ApiKeyAuth | BearerAuth | undefined;
    
    if (bearerToken) {
        auth = {
            type: 'bearer',
            token: bearerToken
        };
    } else if (apiKey) {
        auth = {
            type: 'apiKey',
            key: apiKey,
            name: 'Authorization',
            in: 'header'
        };
    }

    return {
        name: "environment-auth-service",
        description: "Service that uses environment-based authentication",
        openApiSchema: sampleApiSchema,
        auth: auth,
        timeout: 30
    };
}

/**
 * Example 7: Dynamic Authentication - JWT Login
 * For APIs that require login to get a JWT token
 */
function createJWTLoginExample(): APIConfig {
    const dynamicAuth: DynamicAuth = {
        type: 'dynamic',
        authEndpoint: {
            url: '/auth/login',
            method: 'POST',
            credentials: {
                username: Deno.env.get('API_USERNAME') || 'your-username',
                password: Deno.env.get('API_PASSWORD') || 'your-password'
            }
        },
        tokenExtraction: {
            path: 'access_token', // Extract token from response.access_token
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
            duration: 3600 // Cache for 1 hour by default
        }
    };

    return {
        name: "jwt-login-service",
        description: "Service with JWT authentication via login endpoint",
        openApiSchema: sampleApiSchema,
        auth: dynamicAuth,
        timeout: 30
    };
}

/**
 * Example 8: OAuth2 Client Credentials Flow
 * For server-to-server authentication
 */
function createOAuth2Example(): APIConfig {
    const oauthAuth: DynamicAuth = {
        type: 'dynamic',
        authEndpoint: {
            url: 'https://oauth.example.com/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            credentials: {
                grant_type: 'client_credentials',
                client_id: Deno.env.get('OAUTH_CLIENT_ID') || 'your-client-id',
                client_secret: Deno.env.get('OAUTH_CLIENT_SECRET') || 'your-client-secret',
                scope: 'read write'
            }
        },
        tokenExtraction: {
            path: 'access_token',
            type: 'bearer'
        },
        refreshConfig: {
            expiryPath: 'expires_in'
        }
    };

    return {
        name: "oauth2-service",
        description: "Service using OAuth2 client credentials flow",
        openApiSchema: sampleApiSchema,
        auth: oauthAuth,
        timeout: 30
    };
}

/**
 * Example 9: API Key from Auth Endpoint
 * Some APIs give you an API key after authentication
 */
function createApiKeyFromAuthExample(): APIConfig {
    const dynamicAuth: DynamicAuth = {
        type: 'dynamic',
        authEndpoint: {
            url: '/api/authenticate',
            method: 'POST',
            body: {
                email: Deno.env.get('API_EMAIL') || 'user@example.com',
                password: Deno.env.get('API_PASSWORD') || 'password123'
            }
        },
        tokenExtraction: {
            path: 'data.api_key', // Extract from nested response.data.api_key
            type: 'apiKey',
            headerName: 'X-API-Key'
        },
        cache: {
            enabled: true,
            duration: 86400 // Cache for 24 hours
        }
    };

    return {
        name: "dynamic-apikey-service",
        description: "Service that gets API key from auth endpoint",
        openApiSchema: sampleApiSchema,
        auth: dynamicAuth,
        timeout: 30
    };
}

/**
 * Example 10: Discord Bot Authentication
 * Real-world example for Discord API
 */
function createDiscordBotExample(): APIConfig {
    const discordSchema = {
        openapi: "3.0.0",
        info: { title: "Discord API", version: "10" },
        servers: [{ url: "https://discord.com/api/v10" }],
        paths: {
            "/guilds/{guild_id}": {
                get: {
                    operationId: "getGuild",
                    summary: "Get guild",
                    parameters: [
                        {
                            name: "guild_id",
                            in: "path",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    responses: { "200": { description: "Guild object" } }
                }
            }
        }
    };

    // Discord uses Bot tokens, not dynamic auth, but shows the pattern
    const bearerAuth: BearerAuth = {
        type: 'bearer',
        token: Deno.env.get('DISCORD_BOT_TOKEN') || 'your-bot-token',
        scheme: 'Bot' // Discord uses "Bot" instead of "Bearer"
    };

    return {
        name: "discord-api",
        description: "Discord Bot API",
        openApiSchema: discordSchema,
        auth: bearerAuth,
        timeout: 30
    };
}

/**
 * Real-world example: OpenAI API Configuration
 */
function createOpenAIExample(): APIConfig {
    const openaiSchema = {
        openapi: "3.0.0",
        info: { title: "OpenAI API", version: "1.0.0" },
        servers: [{ url: "https://api.openai.com/v1" }],
        paths: {
            "/chat/completions": {
                post: {
                    operationId: "createChatCompletion",
                    summary: "Create a chat completion",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        model: { type: "string" },
                                        messages: { type: "array" }
                                    }
                                }
                            }
                        }
                    },
                    responses: { "200": { description: "Chat completion response" } }
                }
            }
        }
    };

    const bearerAuth: BearerAuth = {
        type: 'bearer',
        token: Deno.env.get('OPENAI_API_KEY') || 'your-openai-api-key'
    };

    return {
        name: "openai-api",
        description: "OpenAI Chat Completions API",
        openApiSchema: openaiSchema,
        auth: bearerAuth,
        timeout: 60
    };
}

/**
 * Test function to demonstrate authentication configurations
 */
async function demonstrateAuthentication() {
    console.log("🔐 API Authentication Examples");
    console.log("=".repeat(50));

    const examples = [
        { name: "API Key (Header)", config: createApiKeyHeaderExample() },
        { name: "API Key (Query)", config: createApiKeyQueryExample() },
        { name: "Bearer Token", config: createBearerTokenExample() },
        { name: "Basic Auth", config: createBasicAuthExample() },
        { name: "Custom Auth", config: createCustomAuthExample() },
        { name: "Environment-based", config: createEnvironmentBasedAuth() },
        { name: "JWT Login (Dynamic)", config: createJWTLoginExample() },
        { name: "OAuth2 Flow (Dynamic)", config: createOAuth2Example() },
        { name: "API Key from Auth (Dynamic)", config: createApiKeyFromAuthExample() },
        { name: "Discord Bot", config: createDiscordBotExample() },
        { name: "OpenAI API", config: createOpenAIExample() }
    ];

    examples.forEach((example, index) => {
        console.log(`\n${index + 1}️⃣ ${example.name}:`);
        console.log(`   Service: ${example.config.name}`);
        console.log(`   Auth Type: ${example.config.auth?.type || 'none'}`);
        
        if (example.config.auth) {
            switch (example.config.auth.type) {
                case 'apiKey':
                    console.log(`   Key Location: ${example.config.auth.in}`);
                    console.log(`   Parameter Name: ${example.config.auth.name}`);
                    break;
                case 'bearer':
                    console.log(`   Scheme: ${example.config.auth.scheme || 'Bearer'}`);
                    break;
                case 'basic':
                    console.log(`   Username: ${example.config.auth.username}`);
                    break;
                case 'custom':
                    console.log(`   Custom Headers: ${Object.keys(example.config.auth.headers || {}).length}`);
                    console.log(`   Custom Queries: ${Object.keys(example.config.auth.queryParams || {}).length}`);
                    break;
                case 'dynamic':
                    console.log(`   Auth Endpoint: ${example.config.auth.authEndpoint.url}`);
                    console.log(`   Token Type: ${example.config.auth.tokenExtraction.type}`);
                    console.log(`   Cache Enabled: ${example.config.auth.cache?.enabled !== false}`);
                    if (example.config.auth.refreshConfig) {
                        console.log(`   Refresh: ${example.config.auth.refreshConfig.refreshEndpoint ? 'Yes' : 'No'}`);
                    }
                    break;
            }
        }

        // Generate tools to verify configuration works
        try {
            const tools = generateApiTools(example.config);
            console.log(`   ✅ Generated ${tools.length} tools successfully`);
        } catch (error) {
            console.log(`   ❌ Tool generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

}

// Main execution
if (import.meta.main) {
    await demonstrateAuthentication();
} 