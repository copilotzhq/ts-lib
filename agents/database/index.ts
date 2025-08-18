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

export async function createDatabase(config?: DatabaseConfig): Promise<any> {
  const agentsSQL = config?.schemaSQL || schemaDDL;
  const finalAgentSQL = Array.isArray(agentsSQL) ? agentsSQL : [agentsSQL];

  const finalConfig = {
    url: config?.url || Deno.env.get("DATABASE_URL") || ":memory:",
    syncUrl: config?.syncUrl || Deno.env.get("SYNC_DATABASE_URL"),
    pgliteExtensions: config?.pgliteExtensions || ["uuid_ossp", "vector", "pg_trgm"],
    schemaSQL: [...finalAgentSQL],
  };

  const ominipg = await Ominipg.connect(finalConfig);
  const dbInstance = await withDrizzle(ominipg, drizzle, {...schema });

  // Add operations to the database instance
  dbInstance.operations = createOperations(dbInstance);

  return dbInstance;
}


export * from "./schema.ts";
export * from "./operations.ts";

export { schema };