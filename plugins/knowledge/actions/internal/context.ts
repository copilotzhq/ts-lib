/** Shared Knowledge context contracts and operations. @module */
import type {
  ActionCallOptions,
  ActionContext,
  RuntimeActionCallers,
} from "@copilotz/copilotz/actions";
import type { KnowledgeEmbeddingProviderResource } from "../../internal/types.ts";
export type KnowledgeActionContext =
  & Omit<ActionContext, "actions" | "adapters">
  & Readonly<{
    actions: Readonly<{
      createThreadMessage:
        & RuntimeActionCallers[string]
        & ((
          input: unknown,
          options?: ActionCallOptions,
        ) => Promise<unknown>);
    }>;
    adapters: Readonly<{
      embedding: Readonly<
        Record<string, KnowledgeEmbeddingProviderResource | undefined>
      >;
    }>;
  }>;
