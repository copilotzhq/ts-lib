// =============================================================================
// UNIFIED AI SERVICE - Single entrypoint for all AI capabilities
// =============================================================================

import type { 
  AIRequest,
  AIResponse,
  AIServiceOverloads,
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

// =============================================================================
// SERVICE IMPLEMENTATIONS
// =============================================================================

/**
 * Execute LLM chat completion
 */
async function executeLLM(request: LLMRequest): Promise<LLMResponse | LLMErrorResponse> {
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
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      answer: '',
      tokens: 0,
      prompt: request.messages // Add required prompt field even for errors
    };
  }
}

/**
 * Execute embedding generation using provider pattern
 */
async function executeEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
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
    return await provider.generateEmbedding(request);
    
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
async function executeSpeechToText(request: SpeechToTextRequest): Promise<SpeechToTextResponse> {
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
    return await provider.transcribe(request);
    
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
async function executeTextToSpeech(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
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
    return await provider.speak(request);
    
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
async function executeImageGeneration(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
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
    return await provider.generateImage(request);
    
  } catch (error) {
    return {
      success: false,
      processingTime: 0,
      error: error instanceof Error ? error.message : String(error),
      images: []
    };
  }
}

// =============================================================================
// MAIN UNIFIED AI FUNCTION
// =============================================================================

/**
 * Unified AI Service - Single entrypoint for all AI capabilities
 * 
 * @example
 * // LLM Chat
 * const llmResponse = await ai({
 *   type: 'llm',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   config: { provider: 'openai', model: 'gpt-4o' }
 * });
 * 
 * @example
 * // Embeddings
 * const embeddings = await ai({
 *   type: 'embedding',
 *   input: 'Text to embed',
 *   config: { model: 'text-embedding-3-small' }
 * });
 * 
 * @example
 * // Speech-to-Text
 * const transcription = await ai({
 *   type: 'speech-to-text',
 *   audio: audioBlob,
 *   config: { language: 'en' }
 * });
 */
// Implementation function that handles all cases
async function aiImplementation(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();
  
  try {
    switch (request.type) {
      case 'llm': {
        const response = await executeLLM(request);
        // Ensure we always have the prompt field for LLM responses
        if (response.success === false) {
          // For error responses, make sure all required fields are present
          return { 
            type: 'llm', 
            ...response,
            prompt: request.messages // Ensure prompt is always present
          };
        }
        return { type: 'llm', ...response };
      }
      
      case 'embedding': {
        const response = await executeEmbedding(request);
        return { type: 'embedding', ...response };
      }
      
      case 'speech-to-text': {
        const response = await executeSpeechToText(request);
        return { type: 'speech-to-text', ...response };
      }
      
      case 'text-to-speech': {
        const response = await executeTextToSpeech(request);
        return { type: 'text-to-speech', ...response };
      }
      
      case 'image-generation': {
        const response = await executeImageGeneration(request);
        return { type: 'image-generation', ...response };
      }
      
      default: {
        const processingTime = Date.now() - startTime;
        // @ts-ignore - This should never happen with proper typing
        throw new Error(`Unsupported AI service type: ${request.type}`);
      }
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Return a generic error response
    return {
      // @ts-ignore - Error case
      type: request.type,
      success: false,
      processingTime,
      error: error instanceof Error ? error.message : String(error)
    } as AIResponse;
  }
}

// Export the function with proper overloads
export const ai: AIServiceOverloads = aiImplementation as any;

// =============================================================================
// CONVENIENCE FUNCTIONS (OPTIONAL - for those who prefer explicit functions)
// =============================================================================

export const chat = (request: Omit<LLMRequest, 'type'>): Promise<LLMResponse> => 
  ai({ type: 'llm', ...request });

export const embed = (request: Omit<EmbeddingRequest, 'type'>): Promise<EmbeddingResponse> => 
  ai({ type: 'embedding', ...request });

export const transcribe = (request: Omit<SpeechToTextRequest, 'type'>): Promise<SpeechToTextResponse> => 
  ai({ type: 'speech-to-text', ...request });

export const speak = (request: Omit<TextToSpeechRequest, 'type'>): Promise<TextToSpeechResponse> => 
  ai({ type: 'text-to-speech', ...request });

export const generateImage = (request: Omit<ImageGenerationRequest, 'type'>): Promise<ImageGenerationResponse> => 
  ai({ type: 'image-generation', ...request });

// =============================================================================
// RE-EXPORTS FROM INDIVIDUAL SERVICES
// =============================================================================

// Export everything from the LLM service for backward compatibility
export * from './llm/index.ts';

// Export types for direct usage
export type * from './types.ts';
