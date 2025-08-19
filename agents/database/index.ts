import { Ominipg, withDrizzle } from "omnipg";
import { drizzle } from "../../db/drizzle.ts";
import { schema, schemaDDL } from "./schema.ts";
import { createOperations } from "./operations.ts";

export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
}

// Simple connection memoization to avoid duplicate initializations for the same target
const connectionCache: Map<string, Promise<any>> = new Map();

export async function createDatabase(config?: DatabaseConfig): Promise<any> {
  const agentsSQL = config?.schemaSQL || schemaDDL;
  const finalAgentSQL = Array.isArray(agentsSQL) ? agentsSQL : [agentsSQL];

  const finalConfig = {
    url: config?.url || Deno.env.get("DATABASE_URL") || ":memory:",
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp", "vector", "pg_trgm"],
    schemaSQL: [...finalAgentSQL],
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  if (connectionCache.has(cacheKey)) {
    return await connectionCache.get(cacheKey)!;
  }

  const connectPromise = (async () => {
    const ominipg = await Ominipg.connect(finalConfig);
    const dbInstance = await withDrizzle(ominipg, drizzle, { ...schema });
    // Add operations to the database instance
    (dbInstance as any).operations = createOperations(dbInstance);
    return dbInstance;
  })();

  connectionCache.set(cacheKey, connectPromise);
  return await connectPromise;
}


export * from "./schema.ts";
export * from "./operations.ts";

export { schema };