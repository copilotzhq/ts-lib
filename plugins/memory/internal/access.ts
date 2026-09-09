/** Memory-space access checks and trusted caller provenance. @module */
import type { CollectionRecord } from "@copilotz/copilotz/collections";
import type { Participant } from "@copilotz/copilotz/core";
import type { MemorySpaceDescriptor } from "../authoring/consolidation/index.ts";
import type {
  MemoryActionContext,
  MemoryProcessorContext,
} from "./contracts.ts";
import { optionalText, requiredText } from "./input.ts";

export function participantAgentId(participant: Participant): string {
  return participant.agentId ?? participant.externalId;
}

export async function threadMemorySpaces(
  context: MemoryProcessorContext,
  threadId: string,
): Promise<readonly MemorySpaceDescriptor[]> {
  const grants = await context.collections.memorySpaceAccess
    .list({ where: { threadId }, limit: 1_000 });
  const spaces: MemorySpaceDescriptor[] = [];
  for (const grant of grants) {
    const memorySpaceId = optionalText(grant.memorySpaceId);
    if (!memorySpaceId) continue;
    const space = await context.collections.memorySpace.get({
      id: memorySpaceId,
    });
    if (!space) continue;
    const access = grant.access === "read_write" ? "read_write" : "read";
    spaces.push(Object.freeze({
      id: memorySpaceId,
      name: optionalText(space.name) ?? `memory:${memorySpaceId}`,
      description: optionalText(space.description) ?? null,
      scopeType: optionalText(space.scopeType) ?? "custom",
      access,
      defaultWrite: access === "read_write" && grant.defaultWrite === true,
    }));
  }
  const ordered = spaces.sort((left, right) =>
    Number(right.defaultWrite) - Number(left.defaultWrite) ||
    left.id.localeCompare(right.id)
  );
  const firstWritable = ordered.find((space) => space.access === "read_write");
  if (firstWritable && !ordered.some((space) => space.defaultWrite)) {
    ordered[ordered.indexOf(firstWritable)] = Object.freeze({
      ...firstWritable,
      defaultWrite: true,
    });
  }
  let usedDefault = false;
  return Object.freeze(ordered.map((space) => {
    if (!space.defaultWrite) return space;
    if (!usedDefault) {
      usedDefault = true;
      return space;
    }
    return Object.freeze({ ...space, defaultWrite: false });
  }));
}

export async function ensureWritableMemorySpace(
  context: MemoryProcessorContext,
  threadId: string,
) {
  const current = await threadMemorySpaces(context, threadId);
  if (current.some((space) => space.access === "read_write")) return current;
  const memorySpaceId = `memory-space:thread:${threadId}`;
  await context.collections.memorySpace.create({
    id: memorySpaceId,
    name: `Thread ${threadId}`,
    scopeType: "thread",
    scopeId: threadId,
    kind: "thread",
    ownerNodeId: threadId,
    threadId,
    access: "read_write",
    defaultWrite: true,
    description: "Default thread memory space",
    metadata: {},
  }, { operationKey: `space:create:${memorySpaceId}` });
  const grantId = `memory-space-access:${threadId}:${memorySpaceId}`;
  await context.collections.memorySpaceAccess.create({
    id: grantId,
    threadId,
    memorySpaceId,
    access: "read_write",
    defaultWrite: true,
    metadata: {},
  }, { operationKey: `space:grant:${grantId}` });
  return await threadMemorySpaces(context, threadId);
}

export function checkpointAccessible(
  checkpoint: CollectionRecord,
  spaces: readonly Pick<MemorySpaceDescriptor, "id">[],
): boolean {
  const readable = new Set(spaces.map((space) => space.id));
  const ids = Array.isArray(checkpoint.readMemorySpaceIds)
    ? checkpoint.readMemorySpaceIds.filter((id): id is string =>
      typeof id === "string"
    )
    : [];
  return ids.length > 0 && ids.every((id) => readable.has(id));
}

export function memoryActionProvenance(context: MemoryActionContext): Readonly<{
  threadId: string;
  agentId: string;
}> {
  return Object.freeze({
    threadId: requiredText(
      context.action.metadata.threadId,
      "Memory Action thread id",
    ),
    agentId: requiredText(
      context.action.metadata.agentId,
      "Memory Action agent id",
    ),
  });
}
