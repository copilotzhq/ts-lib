import { Ominipg, withDrizzle } from "omnipg";
import { drizzle } from "drizzle-orm/pg-proxy";
import { schema, schemaDDL } from "./schema.ts";

export interface DatabaseConfig {
  url?: string;
  syncUrl?: string;
  pgliteExtensions?: string[];
  schemaSQL?: string | string[];
}

export async function createDatabase(config?: DatabaseConfig): Promise<any> {
  const schemaSQL = config?.schemaSQL || schemaDDL;
  const finalSchemaSQL = Array.isArray(schemaSQL) ? schemaSQL : [schemaSQL];

  const finalConfig = {
    url: config?.url || Deno.env.get("DATABASE_URL") || ":memory:",
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp"],
    schemaSQL: finalSchemaSQL,
  };

  const ominipg = await Ominipg.connect(finalConfig);
  const dbInstance = await withDrizzle(ominipg, drizzle, schema);

  return dbInstance;
}


export * from "./schema.ts";

export { schema };