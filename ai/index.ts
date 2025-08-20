// =============================================================================
// UNIFIED AI SERVICE - Single entrypoint for all AI capabilities
// =============================================================================

import type {
  AIRequest,
  AIResponse,
  LLMRequest,
  LLMResponse,
  LLMErrorResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  SpeechToTextRequest,
  SpeechToTextResponse,
  TextToSpeechRequest,
  TextToSpeechResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ProviderName
} from './types.ts';

// Import individual AI services
import { executeChat } from './llm/index.ts';

// Import provider registries
import { getEmbeddingProvider } from './embedding/providers/index.ts';
import { getSpeechToTextProvider } from './speech-to-text/providers/index.ts';
import { getTextToSpeechProvider } from './text-to-speech/providers/index.ts';
import { getImageGenerationProvider } from './image-gen/providers/index.ts';

// Event Queue (shared mechanism across domains)
import { startEventWorker as startGenericEventWorker, enqueueEvent as enqueueGenericEvent, type QueueEvent as GenericQueueEvent, type NewQueueEvent as GenericNewQueueEvent, type WorkerContext as GenericWorkerContext } from '../event-queue/index.ts';
import { createOperations } from '../agents/database/operations.ts';

/**
 * Execute LLM chat completion
 */
async function executeLLM(request: LLMRequest & { dbInstance?: unknown; metadata?: Record<string, unknown> }): Promise<LLMResponse | LLMErrorResponse> {
  try {
    const { stream, ...chatRequest } = request;

    // Default configuration if not provided
    const config = {
      provider: 'openai' as ProviderName,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1000,
      ...request.config
    };

    // Get environment variables for API keys - filter out undefined values
    const envVars = {
      OPENAI_API_KEY: Deno.env.get('DEFAULT_OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY'),
      ANTHROPIC_API_KEY: Deno.env.get('DEFAULT_ANTHROPIC_KEY') || Deno.env.get('ANTHROPIC_API_KEY'),
      GEMINI_API_KEY: Deno.env.get('DEFAULT_GEMINI_KEY') || Deno.env.get('GEMINI_API_KEY'),
      GROQ_API_KEY: Deno.env.get('DEFAULT_GROQ_KEY') || Deno.env.get('GROQ_API_KEY'),
      DEEPSEEK_API_KEY: Deno.env.get('DEFAULT_DEEPSEEK_KEY') || Deno.env.get('DEEPSEEK_API_KEY')
    };

    // Filter out undefined values to create proper Record<string, string>
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const start = Date.now();

    // (Event emission handled by AI worker)
    const result = await executeChat(chatRequest, config, env, stream);

    // Convert ChatResponse to LLMResponse by adding missing BaseAIResponse fields
    return {
      ...result,
      success: true,
      processingTime: 0, // executeChat doesn't track this currently
      prompt: chatRequest.messages // Add required prompt field
    };

  } catch (error) {
    console.error(`❌ [AI-DEBUG] LLM request failed:`, error);
    const errResp = {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      answer: '',
      tokens: 0,
      prompt: request.messages // Add required prompt field even for errors
    };
    // (Queue used for logging; removed ai_logs persistence)
    // (Event emission handled by AI worker)
    return errResp;
  }
}

/**
 * Execute embedding generation using provider pattern
 */
async function executeEmbedding(request: EmbeddingRequest & { dbInstance?: unknown; metadata?: Record<string, unknown> }): Promise<EmbeddingResponse> {
  try {
    // Default configuration
    const config = {
      provider: 'openai' as ProviderName,
      model: 'text-embedding-3-small',
      ...request.config
    };

    // Get the provider factory
    const providerFactory = getEmbeddingProvider(config.provider);

    // Create provider instance with config
    const provider = providerFactory(config);

    // Execute embedding generation
    // (Event emission handled by AI worker)
    const resp = await provider.generateEmbedding(request);

    return resp;

  } catch (error) {
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      embeddings: []
    };
  }
}

/**
 * Execute speech-to-text transcription using provider pattern
 */
async function executeSpeechToText(request: SpeechToTextRequest & { dbInstance?: unknown; metadata?: Record<string, unknown> }): Promise<SpeechToTextResponse> {
  try {
    // Default configuration
    const config = {
      provider: 'openai' as ProviderName,
      model: 'whisper-1',
      language: 'en',
      responseFormat: 'verbose_json' as const,
      ...request.config
    };

    // Get the provider factory
    const providerFactory = getSpeechToTextProvider(config.provider);

    // Create provider instance with config
    const provider = providerFactory(config);

    // Execute speech-to-text transcription
    // (Event emission handled by AI worker)
    const resp = await provider.transcribe(request);

    return resp;

  } catch (error) {
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      text: ''
    };
  }
}

/**
 * Execute text-to-speech generation using provider pattern
 */
async function executeTextToSpeech(request: TextToSpeechRequest & { dbInstance?: unknown; metadata?: Record<string, unknown> }): Promise<TextToSpeechResponse> {
  try {
    // Default configuration
    const config = {
      provider: 'openai' as ProviderName,
      model: 'tts-1',
      voice: 'alloy',
      responseFormat: 'mp3' as const,
      speed: 1.0,
      ...request.config
    };

    // Get the provider factory
    const providerFactory = getTextToSpeechProvider(config.provider);

    // Create provider instance with config
    const provider = providerFactory(config);

    // Execute text-to-speech generation
    // (Event emission handled by AI worker)
    const resp = await provider.speak(request);
    return resp;

  } catch (error) {
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      audio: new ArrayBuffer(0),
      format: 'mp3'
    };
  }
}

/**
 * Execute image generation using provider pattern
 */
async function executeImageGeneration(request: ImageGenerationRequest & { dbInstance?: unknown; metadata?: Record<string, unknown> }): Promise<ImageGenerationResponse> {
  try {
    // Default configuration
    const config = {
      provider: 'openai' as ProviderName,
      model: 'dall-e-3',
      size: '1024x1024' as const,
      quality: 'standard' as const,
      style: 'vivid' as const,
      responseFormat: 'url' as const,
      n: 1,
      ...request.config
    };

    // Get the provider factory
    const providerFactory = getImageGenerationProvider(config.provider);

    // Create provider instance with config
    const provider = providerFactory(config);

    // Execute image generation
    // (Event emission handled by AI worker)
    const resp = await provider.generateImage(request);
    return resp;

  } catch (error) {
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      images: []
    };
  }
}

// Export everything from the LLM service for backward compatibility
export * from './llm/index.ts';

// Export types for direct usage
export type * from './types.ts';

// =============================================================================
// AI EVENT QUEUE INTEGRATION (Asynchronous, DRY with event-queue)
// =============================================================================

// Event types for AI engine
export type AIEventType = 'AI_CALL' | 'AI_RESULT' | 'SYSTEM';
export type AIQueueEvent<T = unknown> = GenericQueueEvent<T> & { type: AIEventType };
export type NewAIQueueEvent<T = unknown> = GenericNewQueueEvent<T> & { type: AIEventType };

// Payloads
export interface AICallPayload {
  service: 'llm' | 'embedding' | 'speech-to-text' | 'text-to-speech' | 'image-generation';
  request: any; // Will be validated per service by processors
  // Optional: attach metadata
  metadata?: Record<string, unknown>;
  // Correlate request/response
  traceId: string;
}

export interface AIResultPayload {
  service: AICallPayload['service'];
  success: boolean;
  response?: unknown;
  error?: string;
  traceId: string;
}

export interface AIWorkerContext extends GenericWorkerContext {
  db: unknown;
  stream?: (data: string) => void;
}

type ProcessorDeps = {
  ops: ReturnType<typeof createOperations>;
  db: unknown;
  context: AIWorkerContext;
};

type AIEventProcessor<TPayload = unknown> = {
  shouldProcess: (event: AIQueueEvent<TPayload>, deps: ProcessorDeps) => boolean | Promise<boolean>;
  process: (event: AIQueueEvent<TPayload>, deps: ProcessorDeps) => Promise<{ producedEvents?: NewAIQueueEvent[] } | void>;
};

// Single input processor that routes per service
const aiCallProcessor: AIEventProcessor<AICallPayload> = {
  shouldProcess: () => true,
  process: async (event, deps) => {
    const payload = event.payload as AICallPayload;
    const { db } = deps;
    const baseMeta = {
      ...(payload.metadata || {}),
      threadId: event.threadId,
      traceId: payload.traceId,
      // Prevent duplicate enqueue from service-level best-effort emitters
      suppressEnqueueEvent: true,
    } as Record<string, unknown>;

    let success = false;
    let error: string | undefined;
    let response: unknown;

    if (deps.context.stream) {
      payload.request.stream = deps.context.stream;
    }

    try {
      switch (payload.service) {
        case 'llm': {
          response = await executeLLM({ ...(payload.request as any), dbInstance: db, metadata: baseMeta } as any);
          success = (response as any)?.success !== false;
          break;
        }
        case 'embedding': {
          response = await executeEmbedding({ ...(payload.request as any), dbInstance: db, metadata: baseMeta } as any);
          success = (response as any)?.success !== false;
          break;
        }
        case 'speech-to-text': {
          response = await executeSpeechToText({ ...(payload.request as any), dbInstance: db, metadata: baseMeta } as any);
          success = (response as any)?.success !== false;
          break;
        }
        case 'text-to-speech': {
          response = await executeTextToSpeech({ ...(payload.request as any), dbInstance: db, metadata: baseMeta } as any);
          success = (response as any)?.success !== false;
          break;
        }
        case 'image-generation': {
          response = await executeImageGeneration({ ...(payload.request as any), dbInstance: db, metadata: baseMeta } as any);
          success = (response as any)?.success !== false;
          break;
        }
        default: {
          throw new Error(`Unsupported AI service: ${(payload as any)?.service}`);
        }
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
    }

    const producedEvents: NewAIQueueEvent[] = [{
      threadId: event.threadId,
      type: 'AI_RESULT',
      payload: {
        service: payload.service,
        success,
        response: success ? response : undefined,
        error: success ? undefined : (error || 'Unknown error'),
        traceId: payload.traceId,
      } as AIResultPayload,
      parentEventId: event.id,
      traceId: event.traceId || payload.traceId,
    }];

    return { producedEvents };
  }
};

const aiResultProcessor: AIEventProcessor<AIResultPayload> = {
  shouldProcess: () => true,
  process: async (_event, _deps) => { return; }
};

const systemProcessor: AIEventProcessor = { shouldProcess: () => true, process: async () => { return; } };

export const aiProcessors: Record<AIEventType, AIEventProcessor<any>> = {
  AI_CALL: aiCallProcessor,
  AI_RESULT: aiResultProcessor,
  SYSTEM: systemProcessor,
};

// Enqueue helpers
export async function enqueueAIEvent(db: unknown, event: NewAIQueueEvent): Promise<void> {
  await enqueueGenericEvent(db, event as GenericNewQueueEvent);
}

export async function startAIWorker(context: { db: unknown; callbacks?: AIWorkerContext['callbacks']; stream?: AIWorkerContext['stream'] }, threadId: string): Promise<void> {

  await startGenericEventWorker<ProcessorDeps>(
    (context as any).db,
    threadId,
    { callbacks: (context as any).callbacks as GenericWorkerContext['callbacks'] },
    aiProcessors as Record<string, any>,
    async (ops, event) => ({ ops, db: (context as any).db, context: (context as any) })
  );
}

// High-level: run a single AI request via the queue and return the result
export async function runAI(context: { db: unknown; callbacks?: AIWorkerContext['callbacks']; threadId?: string; traceId?: string }, request: AIRequest): Promise<{ threadId: string; traceId: string; result?: AIResponse }> {
  const threadId = crypto.randomUUID();

  const traceId = (context as any).traceId || crypto.randomUUID();

  // Prepare payload stripping the discriminant
  const { type, stream, ...rest } = request as any;
  const callPayload: AICallPayload = {
    service: type,
    request: rest,
    traceId,
    metadata: { module: 'ai' },
  };

  let capturedResult: AIResponse | undefined;

  // Intercept AI_RESULT to capture response
  const interceptingContext: AIWorkerContext = {
    db: (context as any).db,
    callbacks: {
      onEvent: async (
        ev: GenericQueueEvent<unknown>,
        _runDefault: (override?: GenericQueueEvent<unknown>) => Promise<{ producedEvents?: GenericNewQueueEvent<unknown>[] }>
      ): Promise<void> => {
        if ((ev.type as any) === 'AI_RESULT') {
          const payload = ev.payload as AIResultPayload;
          if (ev.threadId === threadId && payload.success && payload.response) {
            capturedResult = { type: (payload as any).service, ...(payload.response as any) } as AIResponse;
          } else if (ev.threadId === threadId && !payload.success) {
            capturedResult = { type: (payload as any).service, success: false, error: payload.error || 'Unknown error', processingTime: 0 } as any;
          }
        }
      }
    },
    stream: stream,
  } as any;

  await enqueueAIEvent((context as any).db, {
    threadId,
    type: 'AI_CALL',
    payload: callPayload,
    traceId,

  } as any);

  await startAIWorker(interceptingContext, threadId);

  return { threadId, traceId, result: capturedResult };
}
