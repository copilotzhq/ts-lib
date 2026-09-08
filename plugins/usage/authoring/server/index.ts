/** Exact Usage endpoints composed into the host's existing policy boundary. @module */
import { createHttpAdapter, type HttpAdapter } from "@copilotz/copilotz/server";
export function createUsageHttpAdapter(options: {
  basePath?: string;
  metadata?: Readonly<Record<string, unknown>>;
} = {}): HttpAdapter {
  const base = (options.basePath ?? "/usage").replace(/\/$/, "");
  return createHttpAdapter({
    routes: ["analytics", "attempts"].map((query) => ({
      id: `copilotz.usage.${query}`,
      method: "GET" as const,
      path: query === "analytics" ? base : `${base}/attempts`,
      metadata: { usage: true, ...options.metadata },
      async handler(context) {
        try {
          const search = new URL(context.request.url).searchParams;
          const input: Record<string, unknown> = {};
          for (const key of new Set(search.keys())) {
            if (search.getAll(key).length !== 1) {
              throw new TypeError(`Duplicate usage parameter '${key}'.`);
            }
            input[key] = search.get(key)!;
          }
          const rows = await context.read.query("usage", query, input);
          return Response.json(rows[0]);
        } catch (error) {
          if (error instanceof TypeError || error instanceof RangeError) {
            return Response.json({
              error: { code: "invalid_usage_query", message: error.message },
            }, { status: 400 });
          }
          throw error;
        }
      },
    })),
  });
}
