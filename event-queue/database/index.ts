import { Ominipg, withDrizzle } from "omnipg";
import { drizzle } from "drizzle-orm/pg-proxy";
import { schema as queueSchema, schemaDDL as queueSchemaDDL } from "./schema.ts";
import { createOperations, type Operations } from "./operations.ts";

export interface EventQueueDatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
}

export async function createDatabase(config?: EventQueueDatabaseConfig): Promise<any> {
  const schemaSQL = config?.schemaSQL || queueSchemaDDL;
  const finalSchemaSQL = Array.isArray(schemaSQL) ? schemaSQL : [schemaSQL];

  const finalConfig = {
    url: config?.url || Deno.env.get("DATABASE_URL") || ":memory:",
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp", "pg_trgm"],
    schemaSQL: finalSchemaSQL,
  };

  const ominipg = await Ominipg.connect(finalConfig);
  const dbInstance = await withDrizzle(ominipg, drizzle, queueSchema);
  (dbInstance as any).operations = createOperations(dbInstance) as unknown as Operations;

  return dbInstance;
}

export * from "./schema.ts";


