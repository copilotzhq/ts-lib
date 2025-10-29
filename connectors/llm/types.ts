
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'tool_result';
  content: string;
  tool_call_id?: string;
  // Prefer passing tool calls explicitly for assistant messages
  toolCalls?: ToolCall[];
}

// Comprehensive configuration for AI providers with multimodal support
export interface ProviderConfig {

  // Provider selection
  provider?: ProviderName;
  apiKey?: string;

  // Model configuration
  model?: string;
  temperature?: number;

  // Token limits
  maxTokens?: number;
  maxCompletionTokens?: number;
  maxLength?: number; // For message truncation

  // Response format
  responseType?: 'text' | 'json';
  stream?: boolean;

  // Advanced sampling parameters
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;

  // Stop sequences
  stop?: string | string[];
  stopSequences?: string[];

  // Randomization
  seed?: number;

  /* Provider-specific parameters */

  // Custom base URL (Ollama, self-hosted)
  baseUrl?: string; // Custom base URL (Ollama, self-hosted)

  // Gemini-specific parameters
  candidateCount?: number; // Gemini
  responseMimeType?: string; // Gemini JSON format

  // Ollama-specific parameters
  repeatPenalty?: number; // Ollama
  numCtx?: number; // Ollama context window

  // Anthropic-specific parameters
  metadata?: Record<string, any>; // Anthropic

  // OpenAI-specific parameters
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'; // OpenAI reasoning models (o3, o4)
  user?: string; // OpenAI user identifier
  verbosity?: 'none' | 'low' | 'medium' | 'high'; // OpenAI reasoning models (o3, o4)
}

// Tool definition for standardized tool calling
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Input for chat requests with multimodal support
export interface ChatRequest {
  messages: ChatMessage[];
  instructions?: string;
  config?: ProviderConfig;
  answer?: string; // For mock responses
  tools?: ToolDefinition[]; // Tool definitions for standardized tool calling
  tool_call_id?: string;
}

// Parsed tool call from AI response
export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string of arguments
  };
}

// Response from chat completions with media processing results
export interface ChatResponse {
  prompt: ChatMessage[];
  answer: string;
  tokens: number;
  provider?: ProviderName;
  model?: string;
  toolCalls?: ToolCall[]; // Parsed tool calls from response
  metadata?: {
    provider?: ProviderName;
    timestamp: string;
    messageCount: number;
  } // Execution metadata
}

// Stream callback function
export type StreamCallback = (chunk: string) => void;


// Provider API interface with multimodal support
export interface ProviderAPI {
  endpoint: string;
  headers: (config: ProviderConfig) => Record<string, string>;
  body: (messages: ChatMessage[], config: ProviderConfig) => any;
  extractContent: (data: any) => string | null;
  transformMessages?: (messages: ChatMessage[]) => any; // For provider-specific format
  // Optional custom stream processor for providers with non-standard streaming formats
  processStream?: (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: StreamCallback,
    extractContent: (data: any) => string | null
  ) => Promise<string>;

}

// Provider factory function signature - now much simpler
export interface ProviderFactory {
  (config: ProviderConfig): ProviderAPI;
}

// LLM-specific providers
export type LLMProviderName = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'deepseek' | 'ollama' | 'xai';

// All supported providers (includes LLM, embedding, image generation, speech-to-text, and text-to-speech providers)
export type ProviderName =
  // LLM providers
  | LLMProviderName


// Provider registry
export interface ProviderRegistry {
  [key: string]: ProviderFactory;
}

// Base connector interface (now unused, keeping for backwards compatibility)
export interface ChatConnector {
  (request: ChatRequest, stream?: StreamCallback): Promise<ChatResponse>;
} 