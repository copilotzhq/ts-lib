import { Ominipg, withDrizzle } from "omnipg";
import { drizzle } from "drizzle-orm/pg-proxy";
import { schema as queueSchema, schemaDDL as queueSchemaDDL } from "./schema.ts";
import { createOperations, type Operations } from "./operations.ts";

export interface EventQueueDatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
  useWorker?: boolean;
}

// Memoize connections by URL+syncUrl to avoid duplicate initialization
const connectionCache: Map<string, Promise<any>> = new Map();

export async function createDatabase(config?: EventQueueDatabaseConfig): Promise<any> {
  const schemaSQL = config?.schemaSQL || queueSchemaDDL;
  const finalSchemaSQL = Array.isArray(schemaSQL) ? schemaSQL : [schemaSQL];

  const finalConfig = {
    url: config?.url || Deno.env.get("DATABASE_URL") || ":memory:",
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp", "pg_trgm"],
    schemaSQL: finalSchemaSQL,
    useWorker: config?.useWorker || false,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  if (connectionCache.has(cacheKey)) {
    return await connectionCache.get(cacheKey)!;
  }

  const connectPromise = (async () => {
    const ominipg = await Ominipg.connect(finalConfig);
    const dbInstance = await withDrizzle(ominipg, drizzle, queueSchema);
    (dbInstance as any).operations = createOperations(dbInstance) as unknown as Operations;
    return dbInstance;
  })();

  connectionCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export * from "./schema.ts";


