import { pgTable, uuid, text, varchar, jsonb, integer, timestamp } from "../../drizzle.ts";

export const apis: any = pgTable("apis", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    description: text("description"),
    openApiSchema: jsonb("open_api_schema").$type<object>(),
    baseUrl: text("base_url"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    auth: jsonb("auth").$type<AuthConfig>(),
    timeout: integer("timeout"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type API = typeof apis.$inferSelect;
export type NewAPI = typeof apis.$inferInsert;


// Authentication configuration types
interface ApiKeyAuth {
    type: 'apiKey';
    key: string; // The API key value
    name: string; // Parameter name (e.g., 'X-API-Key', 'api_key')
    in: 'header' | 'query'; // Where to put the API key
}

interface BearerAuth {
    type: 'bearer';
    token: string; // The bearer token (JWT, OAuth token, etc.)
    scheme?: string; // Optional scheme (default: 'Bearer')
}

interface BasicAuth {
    type: 'basic';
    username: string;
    password: string;
}

interface CustomAuth {
    type: 'custom';
    headers?: Record<string, string>; // Custom headers
    queryParams?: Record<string, string>; // Custom query parameters
}

interface DynamicAuth {
    type: 'dynamic';
    authEndpoint: {
        url: string; // Auth endpoint URL (e.g., '/auth/login', '/oauth/token')
        method?: 'GET' | 'POST' | 'PUT'; // HTTP method (default: POST)
        headers?: Record<string, string>; // Headers for auth request
        body?: any; // Auth request body (credentials, client_id, etc.)
        credentials?: {
            username?: string;
            password?: string;
            client_id?: string;
            client_secret?: string;
            grant_type?: string;
            [key: string]: any; // Additional auth parameters
        };
    };
    tokenExtraction: {
        path: string; // JSONPath to extract token (e.g., 'access_token', 'data.token', 'response.authKey')
        type: 'bearer' | 'apiKey'; // How to use the extracted token
        headerName?: string; // For apiKey type: where to put the token (default: 'Authorization')
        prefix?: string; // Token prefix (e.g., 'Bearer ', 'Token ', default: 'Bearer ' for bearer type)
    };
    refreshConfig?: {
        refreshPath?: string; // JSONPath to refresh token (e.g., 'refresh_token')
        refreshEndpoint?: string; // Endpoint for token refresh
        refreshBeforeExpiry?: number; // Refresh N seconds before expiry (default: 300)
        expiryPath?: string; // JSONPath to token expiry (e.g., 'expires_in', 'exp')
    };
    cache?: {
        enabled?: boolean; // Whether to cache tokens (default: true)
        duration?: number; // Cache duration in seconds (default: 3600)
    };
}

type AuthConfig = ApiKeyAuth | BearerAuth | BasicAuth | CustomAuth | DynamicAuth;
