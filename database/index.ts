// Import Ominipg
import { Ominipg, withDrizzle, OminipgDrizzleMixin } from "omnipg";

// Import Drizzle
import { drizzle } from "./drizzle.ts";
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy";

// Import Utils
import { splitSQLStatements } from "./migrations/utils.ts";

// Import Schemas
import {
  queue,
  threads,
  messages,
  tasks,
  agents,
  apis,
  tools,
  mcpServers,
  users,
} from "./schemas/index.ts";


// Import Operations
import { createOperations } from "./operations/index.ts";


// Import Migrations File
// import migrations from "./migrations/migration_0001.sql" with { type: "text" };
import migrations from "./migrations/migration_0001.ts";;

// Define the database config interface
export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string[];
  useWorker?: boolean;
  logMetrics?: boolean;
}

// Define the schema
const schema = {
  queue,
  threads,
  messages,
  tasks,
  agents,
  apis,
  tools,
  mcpServers,
  users,
}


export type DbInstance = PgRemoteDatabase<typeof schema> & OminipgDrizzleMixin;
const createDbInstance = async (finalConfig: DatabaseConfig, debug: boolean, cacheKey: string): Promise<DbInstance> => {
  if (debug) console.log(`[db] creating Ominipg: ${cacheKey}`);
  // Connect to the database
  const ominipg = await Ominipg.connect(finalConfig);
  // Attach schema to the database instance
  const dbInstance = withDrizzle(ominipg, drizzle, { ...schema });
  return dbInstance;
}

export type CopilotzDb = DbInstance & { operations: ReturnType<typeof createOperations> };

interface Connect {
  (finalConfig: DatabaseConfig, debug: boolean, cacheKey: string): Promise<CopilotzDb>;
}

const connect: Connect = async (finalConfig: DatabaseConfig, debug: boolean, cacheKey: string) => {
  if (debug) console.log(`[db] connecting Ominipg: ${cacheKey}`);

  // Create the database instance
  const dbInstance = await createDbInstance(finalConfig, debug, cacheKey);

  // Attach default operations used by agents/event-queue
  const operations = createOperations(dbInstance);

  const dbInstanceWithOperations = Object.assign(dbInstance, { operations });

  return dbInstanceWithOperations;
}

const GLOBAL_CACHE_KEY = "__copilotz_db_cache__";
const existingCache = (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] as Map<string, Promise<CopilotzDb>> | undefined;
const globalCache: Map<string, Promise<CopilotzDb>> = existingCache ?? new Map();
(globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] = globalCache;


// Create singleton database instance with 
export async function createDatabase(config?: DatabaseConfig): Promise<CopilotzDb> {

  const isPgLite = !config?.url || config?.url.startsWith(":") || config?.url.startsWith("file:") || config?.url.startsWith("pglite:");

  const url = config?.url || Deno.env.get("DATABASE_URL") || ":memory:";

  const finalConfig: DatabaseConfig = {
    url,
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: isPgLite ? config?.pgliteExtensions || ["uuid_ossp", "pg_trgm"] : [],
    schemaSQL: splitSQLStatements(migrations),
    useWorker: isPgLite ? config?.useWorker || false : false,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  const debug = (typeof Deno !== 'undefined' && (Deno.env.get("COPILOTZ_DB_DEBUG") === '1'));
  if (debug) {
    console.log(`[db] createDatabase requested: ${cacheKey} ${globalCache.has(cacheKey) ? '[cache-hit]' : '[cache-miss]'}`);
  }
  if (globalCache.has(cacheKey)) {
    return await globalCache.get(cacheKey)!;
  }

  const connectPromise: Promise<CopilotzDb> = connect(finalConfig, debug, cacheKey);

  globalCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export { schema };

