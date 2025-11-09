// Import Ominipg
import { Ominipg } from "omnipg";
import type { OminipgWithCrud } from "omnipg";

// Import Utils
import { splitSQLStatements } from "./migrations/utils.ts";

// Import Schemas
import { schema as baseSchema } from "./schemas/index.ts";

// Import Operations
import { createOperations, type DatabaseOperations } from "./operations/index.ts";

// Import Migrations File
// import migrations from "./migrations/migration_0001.sql" with { type: "text" };
import { generateMigrations } from "./migrations/migration_0001.ts";

const migrations: string = generateMigrations();

// Define the database config interface
export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string[];
  useWorker?: boolean;
  logMetrics?: boolean;
  schemas?: typeof baseSchema;
}


type Operations = DatabaseOperations;

// Strongly-typed instance returned by Ominipg when schemas are provided
export type DbInstance = OminipgWithCrud<typeof baseSchema>;

export type CopilotzDb = DbInstance & { ops: Operations };

const createDbInstance = async (
  finalConfig: DatabaseConfig,
  debug: boolean,
  cacheKey: string,
): Promise<CopilotzDb> => {
  if (debug) console.log(`[db] creating Ominipg: ${cacheKey}`);
  const schemas = finalConfig.schemas ?? baseSchema;

  const dbInstance = await Ominipg.connect({
    url: finalConfig.url,
    syncUrl: finalConfig.syncUrl,
    schemas,
    pgliteExtensions: finalConfig.pgliteExtensions,
    schemaSQL: finalConfig.schemaSQL,
    useWorker: finalConfig.useWorker,
    logMetrics: finalConfig.logMetrics,
  });

  const ops = createOperations(dbInstance);

  return Object.assign(dbInstance, { ops }) as CopilotzDb;
};

interface Connect {
  (
    finalConfig: DatabaseConfig,
    debug: boolean,
    cacheKey: string,
  ): Promise<CopilotzDb>;
}

const connect: Connect = async (
  finalConfig: DatabaseConfig,
  debug: boolean,
  cacheKey: string,
) => {
  if (debug) console.log(`[db] connecting Ominipg: ${cacheKey}`);

  // Create the database instance
  const dbInstance = await createDbInstance(finalConfig, debug, cacheKey);
  return dbInstance;
};

const GLOBAL_CACHE_KEY = "__copilotz_db_cache__";
const existingCache =
  (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] as
    | Map<string, Promise<CopilotzDb>>
    | undefined;
const globalCache: Map<string, Promise<CopilotzDb>> = existingCache ??
  new Map();
(globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] = globalCache;

// Create singleton database instance with
export async function createDatabase(
  config?: DatabaseConfig,
): Promise<CopilotzDb> {
  const isPgLite = !config?.url || config?.url.startsWith(":") ||
    config?.url.startsWith("file:") || config?.url.startsWith("pglite:");

  const url = config?.url || Deno.env.get("DATABASE_URL") || ":memory:";

  const finalConfig: DatabaseConfig = {
    url,
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: isPgLite
      ? config?.pgliteExtensions || ["uuid_ossp", "pg_trgm"]
      : [],
    schemaSQL: [...config?.schemaSQL || [], ...splitSQLStatements(migrations)],
    useWorker: isPgLite ? config?.useWorker || false : false,
    logMetrics: config?.logMetrics,
    schemas: config?.schemas,
  };

  const cacheKey = `${finalConfig.url}|${finalConfig.syncUrl || ""}`;
  const debug = typeof Deno !== "undefined" &&
    (Deno.env.get("COPILOTZ_DB_DEBUG") === "1");
  if (debug) {
    console.log(
      `[db] createDatabase requested: ${cacheKey} ${
        globalCache.has(cacheKey) ? "[cache-hit]" : "[cache-miss]"
      }`,
    );
  }
  if (globalCache.has(cacheKey)) {
    return await globalCache.get(cacheKey)!;
  }

  const connectPromise: Promise<CopilotzDb> = connect(
    finalConfig,
    debug,
    cacheKey,
  );

  globalCache.set(cacheKey, connectPromise);
  return await connectPromise;
}

export { baseSchema as schema, migrations };
