import { knowledge } from "../../../knowledge/index.ts";
import { queue } from "../../../event-queue/database/schema.ts";
import { and, eq, desc } from "drizzle-orm";

interface KnowledgeSearchParams {
  query: string;
  config?: {
    searchType?: "semantic" | "keyword" | "hybrid";
    limit?: number;
    threshold?: number;
    filter?: any;
  };
  embedding?: {
    provider?: string;
    model?: string;
  };
}

export default {
  key: "knowledge_search",
  name: "Knowledge Search",
  description: "Search the internal knowledge base using keyword, semantic, or hybrid search (via knowledge facade). Returns results from the latest KB_DONE event.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query text." },
      config: {
        type: "object",
        properties: {
          searchType: { type: "string", enum: ["semantic", "keyword", "hybrid"], default: "hybrid" },
          limit: { type: "number", default: 10 },
          threshold: { type: "number" },
          filter: { type: "object" },
        },
      },
      embedding: {
        type: "object",
        properties: {
          provider: { type: "string", description: "Embedding provider (e.g., openai)." },
          model: { type: "string", description: "Embedding model (e.g., text-embedding-3-small)." },
        },
      },
    },
    required: ["query"],
  },
  execute: async ({ query, config, embedding }: KnowledgeSearchParams, context?: any) => {
    if (!query || typeof query !== "string") {
      throw new Error("Query must be a non-empty string");
    }

    const db = context?.db;
    const facade = await knowledge({ dbInstance: db });

    const searchType = (config?.searchType || "hybrid") as "semantic" | "keyword" | "hybrid";
    const limit = config?.limit ?? 10;
    const threshold = config?.threshold;
    const filter = config?.filter;

    const provider = embedding?.provider || "openai";
    const model = embedding?.model || "text-embedding-3-small";

    try {
      if (searchType === "keyword") {
        const { threadId, result } = await facade.search({ query, config: { searchType: "keyword", limit, threshold, filter } }, { awaitDone: true });
        const payload = (result || {}) as any;
        return { success: true, threadId, searchType: payload.type || 'keyword', total: payload.totalResults ?? 0, results: payload.results || [] };
      }

      // semantic or hybrid: execute via knowledge facade and await KB_DONE
      const { threadId, result } = await facade.search({ query, config: { searchType, limit, threshold, filter }, embedding: { provider, model } as any }, { awaitDone: true });
      const payload = (result || {}) as any;
      return { success: true, threadId, searchType: payload.type || searchType, total: payload.totalResults ?? 0, results: payload.results || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};


