import { collections, documents, chunks, document_collections } from "./database/schema.ts";

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;

export type DocumentCollection = typeof document_collections.$inferSelect;
export type NewDocumentCollection = typeof document_collections.$inferInsert;