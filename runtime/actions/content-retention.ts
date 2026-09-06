import type { EventMutationContext } from "../events/store.ts";
import { digestContent } from "../content/digest.ts";
import { actionContentSequences } from "./content.ts";
import type { ActionEventData, AnyActionDefinition } from "./types.ts";

/** Keep input Assets alive for the same lifetime as the durable Action receipt. */
export async function retainActionInputContent(
  context: EventMutationContext,
  namespace: string,
  action: AnyActionDefinition,
  data: ActionEventData,
): Promise<void> {
  if (!action.content || data.status !== "invoked") return;
  const refs = actionContentSequences(data.input, action.content)
    .flat() as Record<string, unknown>[];
  const ids = [...new Set(refs.map((ref) => String(ref.assetId)))].sort();
  if (!ids.length) return;
  const assets = await context.transaction.query<
    { id: string; data: Record<string, unknown> }
  >(
    `SELECT id, data FROM ${context.tables.nodes}
     WHERE namespace = $1 AND type = 'asset' AND id = ANY($2::text[])
     ORDER BY id FOR UPDATE`,
    [namespace, ids],
  );
  const byId = new Map(assets.rows.map((row) => [row.id, row.data]));
  for (const ref of refs) {
    const asset = byId.get(String(ref.assetId));
    if (
      !asset || asset.state !== "ready" || asset.mediaType !== ref.mediaType
    ) {
      throw new Error(
        "Action input Asset is unavailable for durable retention.",
      );
    }
  }
  const hash = await digestContent(
    new TextEncoder().encode(JSON.stringify([namespace, data.actionRunId])),
  );
  const ownerId = `action-content:${hash}`;
  await context.transaction.query(
    `INSERT INTO ${context.tables.nodes} (id,namespace,type,name,data,source_type,source_id)
     VALUES ($1,$2,'@copilotz/action-content',$3,$4::jsonb,'action',$5)
     ON CONFLICT DO NOTHING`,
    [
      ownerId,
      namespace,
      data.actionId,
      JSON.stringify({ assetIds: ids }),
      data.actionRunId,
    ],
  );
  const owner = await context.transaction.query<
    {
      namespace: string;
      type: string;
      source_id: string;
      data: { assetIds: string[] };
    }
  >(
    `SELECT namespace,type,source_id,data FROM ${context.tables.nodes} WHERE id = $1`,
    [ownerId],
  );
  const stored = owner.rows[0];
  if (
    !stored || stored.namespace !== namespace ||
    stored.type !== "@copilotz/action-content" ||
    stored.source_id !== data.actionRunId ||
    JSON.stringify(stored.data.assetIds) !== JSON.stringify(ids)
  ) {
    throw new Error(
      "Action content retention identity conflicts with existing data.",
    );
  }
  for (const id of ids) {
    const edgeHash = await digestContent(
      new TextEncoder().encode(JSON.stringify([ownerId, id])),
    );
    await context.transaction.query(
      `INSERT INTO ${context.tables.edges} (id,namespace,source_node_id,target_node_id,type,data,weight)
       VALUES ($1,$2,$3,$4,'has_asset','{}'::jsonb,1) ON CONFLICT DO NOTHING`,
      [`action-content-edge:${edgeHash}`, namespace, ownerId, id],
    );
  }
}
