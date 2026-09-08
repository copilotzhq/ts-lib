import { assertEquals, assertRejects } from "@std/assert";
import { createUsageClient } from "./index.ts";

Deno.test("Usage client encodes filters, forwards auth and cancellation", async () => {
  const controller = new AbortController();
  const client = createUsageClient({
    baseUrl: "https://fixture/api/usage/",
    getRequestHeaders: () => ({ authorization: "Bearer test" }),
    fetch: ((url, init) => {
      const request = new URL(String(url));
      assertEquals(request.pathname, "/api/usage");
      assertEquals(request.searchParams.get("kind"), "llm");
      assertEquals(
        request.searchParams.get("from"),
        "2026-09-01T00:00:00.000Z",
      );
      assertEquals(request.searchParams.get("to"), "2026-09-02T00:00:00.000Z");
      assertEquals(request.searchParams.get("groupBy"), "provider,model");
      assertEquals(request.searchParams.get("interval"), "hour");
      assertEquals(
        new Headers(init?.headers).get("authorization"),
        "Bearer test",
      );
      assertEquals(init?.signal, controller.signal);
      assertEquals(init?.credentials, "include");
      return Promise.resolve(Response.json({ summary: { attempts: 0 } }));
    }) as typeof fetch,
  });
  assertEquals(
    (await client.analytics({
      filters: {
        kind: "llm",
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-02T00:00:00.000Z",
      },
      groupBy: ["provider", "model"],
      interval: "hour",
      signal: controller.signal,
    })).summary.attempts,
    0,
  );
});

Deno.test("Usage client preserves attempts cursors and returns endpoint errors", async () => {
  let call = 0;
  const client = createUsageClient({
    baseUrl: "https://fixture/api/usage",
    fetch: ((url) => {
      call += 1;
      const request = new URL(String(url));
      if (call === 1) {
        assertEquals(request.pathname, "/api/usage/attempts");
        assertEquals(request.searchParams.get("after"), "next/id");
        assertEquals(request.searchParams.get("limit"), "25");
        return Promise.resolve(Response.json({
          items: [],
          pageInfo: { next: null, hasMore: false },
        }));
      }
      return Promise.resolve(Response.json({
        error: { code: "forbidden", message: "Usage access denied." },
      }, { status: 403 }));
    }) as typeof fetch,
  });
  assertEquals(
    await client.attempts({
      filters: {
        kind: "tool",
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-02T00:00:00.000Z",
      },
      after: "next/id",
      limit: 25,
    }),
    { items: [], pageInfo: { next: null, hasMore: false } },
  );
  const error = await assertRejects(
    () =>
      client.analytics({
        filters: {
          kind: "llm",
          from: "2026-09-01T00:00:00.000Z",
          to: "2026-09-02T00:00:00.000Z",
        },
      }),
    Error,
  );
  assertEquals(error.message, "Usage access denied.");
});
