import { createCopilotz } from "../index.ts";
import type { AgentConfig } from "../index.ts";

// Default AssetStore is in-memory (createMemoryAssetStore) and returns data URLs from urlFor().
// This demo calls the native "save_asset" tool directly via a toolCall message,
// listens for ASSET_CREATED, and retrieves the base64 later using copilotz.assets helpers.

const agent: AgentConfig = {
	id: "asset-bot-1",
	name: "AssetBot",
    description: "You handle media. Keep responses short.",
	role: "assistant",
	instructions: "You handle media. Keep responses short.",
	llmOptions: {
		provider: "openai",
		model: "gpt-5",
		apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
	},
	allowedTools: ["save_asset", "return_data_url"], // allow the demo tools
};

const dbFilePath = `${Deno.cwd()}/db.db`;
const THREAD_EXT_ID = "assets-demo-thread";

// Custom tool: returns a data URL string from provided text/mime
const returnDataUrlTool = {
    id: "return_data_url",
	key: "return_data_url",
	name: "Return Data URL",
	description: "Returns a data URL for the provided text (or default).",
	inputSchema: {
		type: "object",
		properties: {
			text: { type: "string", description: "Text content to encode" },
			mimeType: { type: "string", description: "MIME type, default text/plain" },
		},
	},
	// deno-lint-ignore no-explicit-any
	execute: async ({ text, mimeType }: any) => {
		const t = typeof text === "string" ? text : "Hello from data URL tool";
		const m = typeof mimeType === "string" && mimeType.length > 0 ? mimeType : "text/plain";
		const bytes = new TextEncoder().encode(t);
		const b64 = btoa(String.fromCharCode(...bytes));
		return `data:${m};base64,${b64}`;
	},
};

const copilotz = await createCopilotz({
	agents: [agent],
	dbConfig: { url: `file://${dbFilePath}` },
	stream: true,
	tools: [returnDataUrlTool],
	// assets: { config: { inlineThresholdBytes: 256_000 } }, // optional override
});

// Prepare some demo bytes (text/plain)
const text = "Hello from Copilotz AssetStore!";
const base64 = btoa(text);

let firstAssetId: string | null = null;

const handle = await copilotz.run(
	{
		content: "Saving a demo asset via tool call.",
		sender: { type: "agent", name: "AssetBot" },
		thread: { externalId: THREAD_EXT_ID, participants: ["AssetBot"] },
		toolCalls: [
			{
				id: "save_1",
				name: "save_asset",
				args: {
					mimeType: "text/plain",
					dataBase64: base64,
				},
			},
		],
	}
);

for await (const ev of handle.events) {
    if (ev.type === "TOKEN") {
        const token = ev.payload.token;
        if (typeof token === "string") {
            Deno.stdout.writeSync(new TextEncoder().encode(token));
        }
    } else {
        console.log("[EVENT]", ev.type, ev.payload);
    }
	// if (ev.type === "ASSET_CREATED") {
	// 	const p = (ev as any).payload || {};
	// 	console.log("[ASSET_CREATED]", {
	// 		assetId: p.assetId,
	// 		mime: p.mime,
	// 		ref: p.ref,
	// 		base64Len: p.base64 ? (p.base64 as string).length : 0,
	// 	});
	// 	if (!firstAssetId && typeof p.assetId === "string") {
	// 		firstAssetId = p.assetId;
	// 	}
	// }
}

// Drain stream (optional)
for await (const _ of handle.events) { /* drain */ }
await handle.done;

// Retrieve the asset again via helpers
if (firstAssetId) {
	const { base64: b64, mime } = await copilotz.assets.getBase64(firstAssetId);
	console.log("[assets.getBase64]", mime, b64.slice(0, 24) + "...");
	const dataUrl = await copilotz.assets.getDataUrl(firstAssetId);
	console.log("[assets.getDataUrl]", dataUrl.slice(0, 48) + "...");
}

// Second run: custom tool that returns a data URL
const handle2 = await copilotz.run(
	{
		content: "Return a data URL via custom tool.",
		sender: { type: "agent", name: "AssetBot" },
		thread: { externalId: THREAD_EXT_ID, participants: ["AssetBot"] },
		toolCalls: [
			{
				id: "data_1",
				name: "return_data_url",
				args: {
					text: "Hello from custom tool",
					mimeType: "text/plain",
				},
			},
		],
	}
);

for await (const ev of handle2.events) {
	if (ev.type === "TOKEN") {
		const token = ev.payload.token;
		if (typeof token === "string") {
			Deno.stdout.writeSync(new TextEncoder().encode(token));
		}
	} else {
		console.log("[EVENT-2]", ev.type, ev.payload);
	}
}
await handle2.done;

await copilotz.shutdown();


