import type { ProviderRegistry, ProviderName, LLMProviderName, ProviderFactory } from '../types.ts';
import { openaiProvider } from './openai.ts';
import { anthropicProvider } from './anthropic.ts';
import { geminiProvider } from './gemini.ts';
import { groqProvider } from './groq.ts';
import { deepseekProvider } from './deepseek.ts';
import { ollamaProvider } from './ollama.ts';

// Provider registry with all available providers
export const providers: ProviderRegistry = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  groq: groqProvider,
  deepseek: deepseekProvider,
  ollama: ollamaProvider,
};

/**
 * Get a provider by name
 */
export function getProvider(name: ProviderName): ProviderFactory {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Provider '${name}' is not supported. Available providers: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

/**
 * Get list of available provider names
 */
export function getAvailableProviders(): ProviderName[] {
  return Object.keys(providers) as ProviderName[];
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(name: string): name is LLMProviderName {
  return name in providers;
}

/**
 * Get provider default models
 */
export function getProviderDefaults(): Record<LLMProviderName, { model: string; apiKeyEnv: string }> {
  return {
    openai: { model: 'gpt-5-mini', apiKeyEnv: 'OPENAI_API_KEY' },
    anthropic: { model: 'claude-3-haiku-20240307', apiKeyEnv: 'ANTHROPIC_API_KEY' },
    gemini: { model: 'gemini-2.0-flash-lite-preview-02-05', apiKeyEnv: 'GEMINI_API_KEY' },
    groq: { model: 'llama3-8b-8192', apiKeyEnv: 'GROQ_API_KEY' },
    deepseek: { model: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY' },
    ollama: { model: 'llama3.2', apiKeyEnv: 'OLLAMA_BASE_URL' },
    xai: { model: 'grok-beta', apiKeyEnv: 'XAI_API_KEY' },
  };
}

// Export individual providers for direct access
export {
  openaiProvider,
  anthropicProvider,
  geminiProvider,
  groqProvider,
  deepseekProvider,
  ollamaProvider,
}; 