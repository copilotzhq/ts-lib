import type { ContentJsonValue, ContentRef } from "../content/types.ts";

/** Content selection is restricted to the Collection's declared content paths. */
export type CollectionContentOptions =
  | boolean
  | Readonly<{
    fields?: readonly string[];
    /** Entries matching any clause remain explicit, unloaded descriptors. Null matches an absent property. */
    exclude?: readonly Readonly<
      Partial<
        Record<"kind" | "role" | "mediaType" | "disposition", string | null>
      >
    >[];
    /** Aggregate unique Asset body budget; defaults to 32 MiB. */
    byteLimit?: number;
  }>;

export type ScopedCollectionReadOptions<
  C extends CollectionContentOptions = CollectionContentOptions,
> = Readonly<{
  signal?: AbortSignal;
  content?: C;
}>;

/** Rendering metadata and resolved value, discriminated by content kind. */
export type ResolvedCollectionContentEntry =
  | Readonly<ContentRef & { resolve: false; value?: never }>
  | Readonly<
    & Omit<ContentRef, "kind">
    & { resolve?: never }
    & (
      | { kind: "text"; value: string }
      | { kind: "json"; value: ContentJsonValue }
      | {
        kind: Exclude<ContentRef["kind"], "text" | "json">;
        value: Uint8Array;
      }
    )
  >;

type ChildPaths<P extends string, K extends string> = P extends
  `${K}.${infer Rest}` ? Rest : never;

/** Exact literal selections replace only the requested paths. */
export type ResolvedCollectionFields<T, P extends string> = string extends P
  ? ResolvedCollectionContent<T>
  : T extends readonly (infer Item)[]
    ? readonly ResolvedCollectionFields<Item, P>[]
  : T extends object ? {
      [K in keyof T]: K extends string ? K extends P ?
            | readonly ResolvedCollectionContentEntry[]
            | Extract<T[K], null | undefined>
        : [ChildPaths<P, K>] extends [never] ? T[K]
        : ResolvedCollectionFields<T[K], ChildPaths<P, K>>
        : T[K];
    }
  : T;

/** Declarations are runtime data: all-field/dynamic reads conservatively widen fields. */
type ResolvedField<T> = T extends Uint8Array ? T
  : T extends readonly (infer Item)[]
    ? readonly (Item | ResolvedCollectionContentEntry)[]
  : T extends object ? { [K in keyof T]: ResolvedField<T[K]> }
  : T;
export type ResolvedCollectionContent<T> = T extends readonly (infer Item)[]
  ? readonly ResolvedField<Item>[]
  : ResolvedField<T>;
