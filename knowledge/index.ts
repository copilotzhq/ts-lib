/**
 * Knowledge Base Service
 * Unified interface for document ingestion, processing, and retrieval
 */

import { Ominipg } from 'omnipg';
import type {
  KnowledgeBaseConfig,
  KnowledgeBaseRequest,
  KnowledgeBaseResponse,
  DocumentEntity,
  ChunkEntity,
  CollectionEntity,
  SearchResult,
  ExtractionRequest,
  DeepPartial
} from './types.ts';

import {
  KnowledgeBaseError,
  ErrorCodes
} from './types.ts';

// Import core modules
import { KnowledgeBaseDatabaseOperations } from './database/operations.ts';
import { knowledgeBaseSchema, knowledgeBaseSchemaNoPgVector } from './database/schema.ts';
import { extractDocument, getRecommendedConfig } from './extractors/index.ts';
import { chunkText, estimateOptimalChunkSize } from './chunking/index.ts';

// Import AI service for embeddings
import { embed } from '../ai/index.ts';

// =============================================================================
// MAIN KNOWLEDGE BASE CLASS
// =============================================================================

export class KnowledgeBase {
  private db: KnowledgeBaseDatabaseOperations;
  private ominipg: any;
  private config: KnowledgeBaseConfig;

  constructor(config: KnowledgeBaseConfig) {
    this.config = config;
  }

  /**
   * Initialize the knowledge base with database connection
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing Knowledge Base...');

      // Connect to database using ominipg
      this.ominipg = await Ominipg.connect({
        url: this.config.database.url,
        syncUrl: this.config.database.syncUrl,
        pgliteExtensions: ['uuid_ossp', 'vector', 'pg_trgm'], // Load UUID and vector extensions
        schemaSQL: this.config.database.schema || knowledgeBaseSchema
      });

      console.log('📊 Database connected successfully');

      // Initialize database operations
      this.db = new KnowledgeBaseDatabaseOperations(this.ominipg);
      await this.db.initialize();

      console.log('✅ Knowledge Base initialized');
    } catch (error) {
      throw new KnowledgeBaseError(
        `Failed to initialize knowledge base: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * Process a knowledge base request
   */
  async process(request: KnowledgeBaseRequest): Promise<KnowledgeBaseResponse> {
    const startTime = Date.now();

    try {
      switch (request.type) {
        case 'ingest':
          return await this.ingestDocument(request, startTime);

        case 'query':
          return await this.queryDocuments(request, startTime);

        case 'search':
          return await this.searchDocuments(request, startTime);

        case 'retrieve':
          return await this.retrieveDocument(request, startTime);

        case 'delete':
          return await this.deleteDocument(request, startTime);

        case 'collections':
          return await this.handleCollections(request, startTime);

        default:
          throw new KnowledgeBaseError(
            `Unknown request type: ${(request as any).type}`,
            ErrorCodes.INVALID_CONFIG
          );
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof KnowledgeBaseError) {
        throw error;
      }

      throw new KnowledgeBaseError(
        `Knowledge base operation failed: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        { originalError: error, processingTime }
      );
    }
  }

  // =============================================================================
  // DOCUMENT INGESTION
  // =============================================================================

  private async ingestDocument(
    request: Extract<KnowledgeBaseRequest, { type: 'ingest' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'ingest' }>> {
    console.log('📥 Starting document ingestion...');

    try {
      // Step 1: Extract content from source
      const extractionRequest: ExtractionRequest = {
        source: request.source,
        config: request.config || getRecommendedConfig(request.source) || {
          provider: 'text' as any,
          options: this.config.chunking
        },
        metadata: { collectionId: request.collectionId }
      };

      console.log(`🔄 Extracting content using ${extractionRequest.config.provider} extractor...`);
      const extractionResult = await extractDocument(extractionRequest);

      if (!extractionResult.success) {
        return {
          type: 'ingest',
          success: false,
          error: extractionResult.error,
          processingTime: Date.now() - startTime
        };
      }

      // Step 2: Create document entity
      const documentData: Omit<DocumentEntity, 'id' | 'createdAt' | 'updatedAt'> = {
        title: extractionResult.metadata?.title || 'Untitled Document',
        content: extractionResult.content!,
        documentType: this.inferDocumentType(request.source),
        sourceType: request.source.type,
        sourceUrl: request.source.type === 'url' ? request.source.url : undefined,
        fileName: this.extractFileName(request.source),
        fileSize: this.extractFileSize(request.source),
        mimeType: this.extractMimeType(request.source),
        metadata: extractionResult.metadata || {},
        extractedAt: new Date().toISOString(),
        status: 'completed'
      };

      const documentId = await this.db.insertDocument(documentData);
      console.log(`📝 Document saved with ID: ${documentId}`);

      // Step 3: Process chunks
      let chunks = extractionResult.chunks;
      let chunkCount = 0;

      if (!chunks) {
        // Generate chunks if not provided by extractor
        const optimalConfig = estimateOptimalChunkSize(extractionResult.content!);
        chunks = chunkText(extractionResult.content!, {
          ...this.config.chunking,
          strategy: optimalConfig.strategy,
          size: optimalConfig.recommended
        });
      }

      if (chunks.length > 0) {
        // Prepare chunk entities
        const chunkEntities: Omit<ChunkEntity, 'id' | 'createdAt'>[] = chunks.map((chunk, index) => ({
          documentId,
          content: chunk.content,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          chunkIndex: index,
          metadata: chunk.metadata || {}
        }));

        // Insert chunks
        const chunkIds = await this.db.insertChunks(chunkEntities);
        chunkCount = chunkIds.length;
        console.log(`📦 Created ${chunkCount} chunks`);

        // Step 4: Generate embeddings
        await this.generateEmbeddingsForChunks(chunkIds, chunks);
      }

      // Step 5: Add to collection if specified
      if (request.collectionId) {
        await this.db.addDocumentToCollection(documentId, request.collectionId);
        console.log(`🗂️ Added to collection: ${request.collectionId}`);
      }

      // Update document status
      await this.db.updateDocument(documentId, { status: 'indexed' });

      const processingTime = Date.now() - startTime;
      console.log(`✅ Document ingestion completed in ${processingTime}ms`);

      return {
        type: 'ingest',
        success: true,
        documentId,
        chunks: chunkCount,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Document ingestion failed:', error);

      return {
        type: 'ingest',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime
      };
    }
  }

  private async generateEmbeddingsForChunks(chunkIds: string[], chunks: any[]): Promise<void> {
    // Skip embedding generation if using mock provider or no provider is available
    if (this.config.embedding.provider === 'mock' ||
      (!Deno.env.get('DEFAULT_OPENAI_KEY') && !Deno.env.get('OPENAI_API_KEY'))) {
      console.log('⚠️  Skipping embedding generation (no API key or mock provider)');
      return;
    }

    console.log('🧠 Generating embeddings...');

    try {
      const embeddingRequests = chunks.map(chunk => ({
        content: chunk.content,
        provider: this.config.embedding.provider,
        model: this.config.embedding.model || 'text-embedding-ada-002'
      }));

      // Generate embeddings in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < embeddingRequests.length; i += batchSize) {
        const batch = embeddingRequests.slice(i, i + batchSize);

        const embeddingPromises = batch.map(async (req, batchIndex) => {
          try {
            const embedding = await embed({
              input: req.content,
              config: {
                provider: req.provider as any,
                model: req.model
              }
            });

            // Check if embedding generation was successful
            if (!embedding.success || !embedding.embeddings) {
              throw new Error(embedding.error || 'Embedding generation failed');
            }

            const chunkId = chunkIds[i + batchIndex];
            // Handle both 1D and 2D embedding arrays
            const embeddingVector = Array.isArray(embedding.embeddings[0])
              ? embedding.embeddings[0] as number[]
              : embedding.embeddings as number[];

            // Validate embedding dimensions (should match expected dimensions)
            const expectedDims = this.config.embedding.dimensions || 1536;
            if (embeddingVector.length !== expectedDims) {
              console.warn(`Embedding dimension mismatch for chunk ${chunkId}: expected ${expectedDims}, got ${embeddingVector.length}. Skipping embedding.`);
              return { success: false, chunkId, error: 'Dimension mismatch' };
            }

            // Validate that all values are numbers
            if (!embeddingVector.every(val => typeof val === 'number' && !isNaN(val))) {
              console.warn(`Embedding contains invalid values for chunk ${chunkId}. Skipping embedding.`);
              return { success: false, chunkId, error: 'Invalid numeric values' };
            }

            await this.db.updateChunkEmbedding(chunkId, embeddingVector, req.model);

            return { success: true, chunkId };
          } catch (error) {
            console.warn(`Failed to generate embedding for chunk ${chunkIds[i + batchIndex]}:`, error);
            return { success: false, chunkId: chunkIds[i + batchIndex], error };
          }
        });

        await Promise.all(embeddingPromises);

        // Small delay between batches
        if (i + batchSize < embeddingRequests.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('✅ Embeddings generated successfully');
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      // Don't throw - embeddings are optional for search functionality
    }
  }

  // =============================================================================
  // SEARCH AND QUERY
  // =============================================================================

  private async queryDocuments(
    request: Extract<KnowledgeBaseRequest, { type: 'query' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'query' }>> {
    console.log(`🔍 Querying: "${request.query}"`);

    try {
      // Generate query embedding
      const queryEmbedding = await embed({
        input: request.query,
        config: {
          provider: this.config.embedding.provider as any,
          model: this.config.embedding.model || 'text-embedding-ada-002'
        }
      });

      // Perform semantic search
      const embeddingVector = Array.isArray(queryEmbedding.embeddings[0])
        ? queryEmbedding.embeddings[0] as number[]
        : queryEmbedding.embeddings as number[];
      const results = await this.db.searchSemantic(embeddingVector, {
        limit: request.config?.limit || 10,
        threshold: request.config?.threshold || 0.7,
        filters: request.config?.filter
      });

      const processingTime = Date.now() - startTime;

      return {
        type: 'query',
        results,
        totalResults: results.length,
        processingTime
      };
    } catch (error) {
      // Fallback to keyword search if embedding fails
      console.warn('Semantic search failed, falling back to keyword search:', error);

      const results = await this.db.searchKeyword(request.query, {
        limit: request.config?.limit || 10,
        threshold: request.config?.threshold ?? 0.1,
        filters: request.config?.filter
      });

      const processingTime = Date.now() - startTime;

      return {
        type: 'query',
        results,
        totalResults: results.length,
        processingTime
      };
    }
  }

  private async searchDocuments(
    request: Extract<KnowledgeBaseRequest, { type: 'search' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'search' }>> {
    console.log(`🔎 Searching (${request.config?.searchType}): "${request.query}"`);

    try {
      let results: SearchResult[] = [];

      switch (request.config?.searchType) {
        case 'semantic': {
          const queryEmbedding = await embed({
            input: request.query,
            config: {
              provider: this.config.embedding.provider as any,
              model: this.config.embedding.model || 'text-embedding-ada-002'
            }
          });
          const semanticVector = Array.isArray(queryEmbedding.embeddings[0])
            ? queryEmbedding.embeddings[0] as number[]
            : queryEmbedding.embeddings as number[];
          results = await this.db.searchSemantic(semanticVector, {
            limit: request.config?.limit || 10,
            threshold: request.config?.threshold ?? 0.7,
            filters: request.config?.filter
          });
          break;
        }
        case 'keyword': {
          results = await this.db.searchKeyword(request.query, {
            limit: request.config?.limit || 10,
            threshold: request.config?.threshold ?? 0.1,
            filters: request.config?.filter
          });
          break;
        }
        case 'hybrid':
        default: {
          const hybridEmbedding = await embed({
            input: request.query,
            config: {
              provider: this.config.embedding.provider as any,
              model: this.config.embedding.model || 'text-embedding-ada-002'
            }
          });
          const hybridVector = Array.isArray(hybridEmbedding.embeddings[0])
            ? hybridEmbedding.embeddings[0] as number[]
            : hybridEmbedding.embeddings as number[];
          results = await this.db.searchHybrid(request.query, hybridVector, {
            limit: request.config?.limit || 10,
            threshold: request.config?.threshold ?? 0.5,
            filters: request.config?.filter
          });
          break;
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        type: 'search',
        results,
        totalResults: results.length,
        processingTime
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      throw new KnowledgeBaseError(
        `Search failed: ${error.message}`,
        ErrorCodes.DATABASE_ERROR,
        { originalError: error, processingTime }
      );
    }
  }

  // =============================================================================
  // DOCUMENT OPERATIONS
  // =============================================================================

  private async retrieveDocument(
    request: Extract<KnowledgeBaseRequest, { type: 'retrieve' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'retrieve' }>> {
    try {
      const document = await this.db.getDocument(request.documentId);

      if (!document) {
        return {
          type: 'retrieve',
          error: 'Document not found'
        };
      }

      const chunks = await this.db.getChunks(request.documentId);

      return {
        type: 'retrieve',
        document,
        chunks
      };
    } catch (error) {
      return {
        type: 'retrieve',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async deleteDocument(
    request: Extract<KnowledgeBaseRequest, { type: 'delete' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'delete' }>> {
    try {
      const success = await this.db.deleteDocument(request.documentId);
      return {
        type: 'delete',
        success
      };
    } catch (error) {
      return {
        type: 'delete',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleCollections(
    request: Extract<KnowledgeBaseRequest, { type: 'collections' }>,
    startTime: number
  ): Promise<Extract<KnowledgeBaseResponse, { type: 'collections' }>> {
    try {
      switch (request.action) {
        case 'list':
          const collections = await this.db.listCollections();
          return {
            type: 'collections',
            collections,
            success: true
          };

        case 'create':
          const collectionId = await this.db.createCollection(request.data);
          return {
            type: 'collections',
            success: true,
            collections: [{ id: collectionId, ...request.data }]
          };

        case 'delete':
          // TODO: Implement collection deletion
          return {
            type: 'collections',
            success: false,
            error: 'Collection deletion not yet implemented'
          };

        default:
          return {
            type: 'collections',
            success: false,
            error: `Unknown collection action: ${request.action}`
          };
      }
    } catch (error) {
      return {
        type: 'collections',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private inferDocumentType(source: any): any {
    if (source.type === 'url') {
      const url = source.url.toLowerCase();
      if (url.endsWith('.pdf')) return 'pdf';
      if (url.endsWith('.doc') || url.endsWith('.docx')) return 'doc';
      if (url.endsWith('.csv')) return 'csv';
      if (url.endsWith('.json')) return 'json';
      return 'web';
    }

    if (source.type === 'file') {
      const mimeType = source.file?.type || '';
      if (mimeType === 'application/pdf') return 'pdf';
      if (mimeType.includes('word')) return 'doc';
      if (mimeType === 'text/csv') return 'csv';
      if (mimeType === 'application/json') return 'json';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
    }

    return 'txt';
  }

  private extractFileName(source: any): string | undefined {
    if (source.fileName) return source.fileName;
    if (source.type === 'url') {
      try {
        const url = new URL(source.url);
        return url.pathname.split('/').pop() || undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private extractFileSize(source: any): number | undefined {
    if (source.type === 'file' && source.file?.size) {
      return source.file.size;
    }
    return undefined;
  }

  private extractMimeType(source: any): string | undefined {
    if (source.type === 'file') return source.file?.type;
    if (source.type === 'base64') return source.mimeType;
    return undefined;
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    // TODO: Implement proper cleanup if ominipg supports it
    console.log('🔌 Knowledge Base connections closed');
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a knowledge base instance with default configuration
 */
export async function createKnowledgeBase(config: DeepPartial<KnowledgeBaseConfig>): Promise<KnowledgeBase> {
  const defaultConfig: KnowledgeBaseConfig = {
    database: {
      url: config.database?.url || ':memory:',
      syncUrl: config.database?.syncUrl,
      schema: config.database?.schema || knowledgeBaseSchema
    },
    embedding: {
      provider: config.embedding?.provider || 'openai',
      model: config.embedding?.model || 'text-embedding-ada-002',
      dimensions: config.embedding?.dimensions || 1536
    },
    chunking: {
      strategy: config.chunking?.strategy || 'sentences',
      size: config.chunking?.size || 1000,
      overlap: config.chunking?.overlap || 200,
      preserveStructure: config.chunking?.preserveStructure ?? true,
      minChunkSize: config.chunking?.minChunkSize || 100,
      maxChunkSize: config.chunking?.maxChunkSize || 2000
    },
    extractors: config.extractors || {}
  };

  const kb = new KnowledgeBase(defaultConfig);
  await kb.initialize();
  return kb;
}

/**
 * Process a single knowledge base request
 */
export async function processKnowledgeBaseRequest(
  request: KnowledgeBaseRequest,
  config?: DeepPartial<KnowledgeBaseConfig>
): Promise<KnowledgeBaseResponse> {
  const kb = await createKnowledgeBase(config || {});
  try {
    return await kb.process(request);
  } finally {
    await kb.close();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { KnowledgeBase as default };
export * from './types.ts';
export * from './extractors/index.ts';
export * from './chunking/index.ts';
export { KnowledgeBaseDatabaseOperations } from './database/operations.ts';
