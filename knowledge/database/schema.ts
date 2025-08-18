/**
 * Knowledge Base Database Schema (Drizzle + DDL)
 */

import { pgTable, uuid, varchar, text, jsonb, timestamp, integer } from "../../db/drizzle.ts";

// =============================================================================
// Drizzle table definitions
// =============================================================================

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceUrl: text("source_url"),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  extractedAt: timestamp("extracted_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  status: varchar("status", { enum: ["processing", "completed", "failed", "indexed"] }).default("processing").notNull(),
  errorMessage: text("error_message"),
});

export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  content: text("content").notNull(),
  startIndex: integer("start_index").notNull(),
  endIndex: integer("end_index").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  // Drizzle has no native vector type; we expose both shapes for compatibility
  embedding: text("embedding"), // when pgvector is present, DDL will define true vector type
  embeddingJson: text("embedding_json"), // JSON fallback
  embeddingModel: varchar("embedding_model", { length: 100 }),
  embeddedAt: timestamp("embedded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const document_collections = pgTable("document_collections", {
  documentId: uuid("document_id").notNull(),
  collectionId: uuid("collection_id").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

export const knowledgeBaseSchema = {
  collections,
  documents,
  chunks,
  document_collections,
};

// =============================================================================
// SCHEMA DDL STATEMENTS
// =============================================================================

export const knowledgeBaseDDL: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE EXTENSION IF NOT EXISTS "vector"`,
  `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`,

  `CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    file_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    extracted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'indexed')),
    error_message TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_index INTEGER NOT NULL,
    end_index INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    embedding_model VARCHAR(100),
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
  )`,

  `CREATE TABLE IF NOT EXISTS document_collections (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (document_id, collection_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN(metadata)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_content_fts ON documents USING GIN(to_tsvector('english', content))`,
  
  `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON chunks USING GIN(to_tsvector('english', content))`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING GIN(metadata)`,
  
  `CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
  
  `CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name)`,
  `CREATE INDEX IF NOT EXISTS idx_document_collections_collection ON document_collections(collection_id)`,
];

export const knowledgeBaseDDLNoPgVector: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`,

  `CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT,
    file_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    extracted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'indexed')),
    error_message TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_index INTEGER NOT NULL,
    end_index INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding_json TEXT,
    embedding_model VARCHAR(100),
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
  )`,

  `CREATE TABLE IF NOT EXISTS document_collections (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (document_id, collection_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN(metadata)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_content_fts ON documents USING GIN(to_tsvector('english', content))`,

  `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON chunks USING GIN(to_tsvector('english', content))`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING GIN(metadata)`,

  `CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name)`,
  `CREATE INDEX IF NOT EXISTS idx_document_collections_collection ON document_collections(collection_id)`,
];

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

export const migrations = {
  addVectorSupport: [
    `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding VECTOR(1536)`,
    `CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
    `ALTER TABLE chunks DROP COLUMN IF EXISTS embedding_json`
  ],
  removeVectorSupport: [
    `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_json TEXT`,
    `UPDATE chunks SET embedding_json = embedding::text WHERE embedding IS NOT NULL`,
    `DROP INDEX IF EXISTS idx_chunks_embedding_cosine`,
    `ALTER TABLE chunks DROP COLUMN IF EXISTS embedding`
  ],
  enhanceTextSearch: [
    `CREATE INDEX IF NOT EXISTS idx_documents_title_fts ON documents USING GIN(to_tsvector('english', title))`,
    `CREATE INDEX IF NOT EXISTS idx_chunks_content_trigram ON chunks USING GIN(content gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_content_trigram ON documents USING GIN(content gin_trgm_ops)`
  ]
};

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

export const schemaValidation = {
  checkPgVectorSupport: `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')`,
  checkPgTrgmSupport: `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')`,
  checkTableExists: (tableName: string) => `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}')`,
  getEmbeddingDimensions: `SELECT typlen FROM pg_type WHERE typname = 'vector'`
};

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const defaultSchemaConfig = {
  embeddingDimensions: 1536,
  useVector: true,
  fallbackToJson: true,
  enableFullTextSearch: true,
  enableTrigrams: true
};