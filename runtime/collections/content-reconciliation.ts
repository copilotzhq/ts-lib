import type {
  AssetManifestEntry,
  AssetMaterializationPlan,
} from "../content/types.ts";
import type { CollectionEventBody, CollectionRecord } from "./types.ts";
import { getPath, setPath } from "./content-path.ts";

type Plan = Readonly<{
  write: Readonly<
    { body: CollectionEventBody<CollectionRecord>; record: CollectionRecord }
  >;
  content: readonly AssetMaterializationPlan[];
  expected?: CollectionRecord | null;
}>;

/** Rebind only runtime-owned content references; preserve the caller's intent. */
export function reconcileCollectionContent(
  plan: Plan,
  fields: readonly string[],
  replacements: ReadonlyMap<string, AssetManifestEntry>,
): Plan {
  if (!replacements.size) return plan;
  const refs = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map((ref) => {
        const replacement = ref && typeof ref === "object"
          ? replacements.get(ref.assetId)
          : undefined;
        return replacement ? { ...ref, assetId: replacement.assetId } : ref;
      })
      : value;
  const record = <T extends Record<string, unknown>>(value: T): T => {
    const result = structuredClone(value);
    for (const field of fields) {
      const value = getPath(result, field);
      if (value !== undefined) setPath(result, field, refs(value));
    }
    return result;
  };
  const assets = (entries: readonly AssetManifestEntry[]) => [...new Map(
    entries.map((entry) => {
      const value = replacements.get(entry.assetId) ?? entry;
      return [value.assetId, value] as const;
    }),
  ).values()];
  const projected = record(plan.write.record);
  const body = plan.write.body;
  return {
    ...plan,
    write: {
      record: projected,
      body: {
        ...body,
        record: projected,
        ...(body.operation === "update" ? { set: record(body.set ?? {}) } : {}),
        assets: assets(body.assets),
      },
    },
    ...(plan.expected ? { expected: record(plan.expected) } : {}),
    content: plan.content.map((content) => ({
      ...content,
      content: refs(content.content) as AssetMaterializationPlan["content"],
      assets: assets(content.assets),
      adoptions: content.adoptions.filter((adoption) =>
        !replacements.has(adoption.asset.id)
      ),
    })),
  };
}
