import { isContentRef } from "../content/schema.ts";
import type { ContentRef } from "../content/types.ts";
import type { ContentResolver } from "../content/resolver.ts";
import type { CollectionDefinition } from "./definition.ts";
import { getPath } from "./content-path.ts";
import type {
  ResolvedCollectionContent,
  ResolvedCollectionFields,
  ScopedCollectionReadOptions,
} from "./read-options.ts";

/** Resolves selected declared fields without mutating records returned by storage. */
async function resolveCollectionRead<T>(
  read: () => Promise<T>,
  definition: CollectionDefinition,
  namespace: string,
  resolver: ContentResolver | undefined,
  options?: ScopedCollectionReadOptions,
): Promise<unknown> {
  const signal = options?.signal;
  signal?.throwIfAborted();
  const selection = options?.content;
  if (!selection) {
    const data = await read();
    signal?.throwIfAborted();
    return data;
  }
  const config = selection === true ? {} : selection;
  const exclude = structuredClone(config.exclude ?? []);
  if (
    !Array.isArray(exclude) || exclude.length > 32 ||
    exclude.some((clause) =>
      !clause || typeof clause !== "object" || !Object.keys(clause).length ||
      Object.entries(clause).some(([key, value]) =>
        !["kind", "role", "mediaType", "disposition"].includes(key) ||
        (value !== null && typeof value !== "string")
      )
    )
  ) throw new TypeError("Invalid content exclusion clauses.");
  const declared = definition.content?.fields ?? [];
  const fields = [...new Set(config.fields ?? declared)];
  for (const field of fields) {
    if (!declared.includes(field)) {
      throw new TypeError(`Undeclared content field '${field}'.`);
    }
  }
  const maxBytes = config.byteLimit ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError(
      "content.byteLimit must be a non-negative safe integer.",
    );
  }
  const data = await read();
  signal?.throwIfAborted();
  const result = structuredClone(data);
  const refs: ContentRef[] = [];
  const targets: { values: unknown[]; index: number }[] = [];
  for (
    const record of result === null
      ? []
      : Array.isArray(result)
      ? result
      : [result]
  ) {
    for (const field of fields) {
      const value = getPath(record as Record<string, unknown>, field);
      if (value === undefined || value === null) continue;
      if (!Array.isArray(value)) {
        throw new TypeError(`Invalid content field '${field}'.`);
      }
      for (const [index, ref] of value.entries()) {
        if (!isContentRef(ref)) {
          throw new TypeError(`Invalid content reference in '${field}'.`);
        }
        if (
          exclude.some((clause) =>
            Object.entries(clause).every(([key, match]) =>
              (value[index][key] ?? null) === match
            )
          )
        ) {
          const { value: _body, resolve: _policy, ...descriptor } =
            value[index];
          value[index] = { ...descriptor, resolve: false };
          continue;
        }
        targets.push({ values: value, index });
        refs.push(ref);
      }
    }
  }
  if (refs.length && !resolver) {
    throw new Error("Collection content resolver is not configured.");
  }
  const resolved = refs.length
    ? await resolver!.getMany(refs, { namespace, signal, maxBytes })
    : [];
  signal?.throwIfAborted();
  for (const [offset, { values, index }] of targets.entries()) {
    const item = resolved[offset];
    const value = item.ref.kind === "text"
      ? item.text
      : item.ref.kind === "json"
      ? item.value
      : item.bytes;
    const { resolve: _policy, ...metadata } = structuredClone(refs[offset]) as
      & ContentRef
      & { resolve?: unknown };
    values[index] = { ...metadata, value };
  }
  return result;
}

/** Bind the overloads once so every read uses the same resolution boundary. */
export function createResolvedCollectionReader<Input, Data>(
  read: (input: Input) => Promise<Data>,
  definition: CollectionDefinition,
  namespace: string,
  resolver: ContentResolver | undefined,
) {
  function readContent<const Fields extends readonly string[]>(
    input: Input,
    options: ScopedCollectionReadOptions & {
      content: { fields: Fields; byteLimit?: number };
    },
  ): Promise<ResolvedCollectionFields<Data, Fields[number]>>;
  function readContent(
    input: Input,
    options?: ScopedCollectionReadOptions<false>,
  ): Promise<Data>;
  function readContent(
    input: Input,
    options?: ScopedCollectionReadOptions,
  ): Promise<ResolvedCollectionContent<Data>>;
  function readContent(
    input: Input,
    options?: ScopedCollectionReadOptions,
  ): Promise<unknown> {
    return resolveCollectionRead(
      () => read(input),
      definition,
      namespace,
      resolver,
      options,
    );
  }
  return readContent;
}
