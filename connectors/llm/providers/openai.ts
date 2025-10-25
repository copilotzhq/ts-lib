import type { ProviderFactory, ProviderConfig, ChatMessage } from '../types.ts';

// Helper function to check if a model is a reasoning model
function isReasoningModel(model: string): boolean {
  return model.startsWith('o3') || model.startsWith('o4') || model.includes('o1') || model.startsWith('gpt-5');
}

function isGPT5Model(model: string): boolean {
  return model.startsWith('gpt-5');
}

export const openaiProvider: ProviderFactory = (config: ProviderConfig) => {
  return {
    endpoint: 'https://api.openai.com/v1/chat/completions',

    headers: (config: ProviderConfig) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    }),

    body: (messages: ChatMessage[], config: ProviderConfig) => {
      // Transform messages to support multimodal content
      const openaiMessages = messages.map(msg => {
        const baseMessage = {
          role: msg.role,
          content: msg.content
        };

        return baseMessage;
      });

      const modelName = config.model || 'gpt-4o-mini';
      const bodyConfig: any = {
        model: modelName,
        messages: openaiMessages,
        stream: true,
        temperature: config.temperature || 1,
        top_p: config.topP,
        presence_penalty: config.presencePenalty,
        frequency_penalty: config.frequencyPenalty,
        stop: config.stop,
        seed: config.seed,
        user: config.user,
        reasoning_effort: config.reasoningEffort,
        verbosity: config.verbosity,
        response_format: config.responseType === 'json'
          ? { type: 'json_object' }
          : undefined,
      };

      // Token limits: OpenAI chat completions expects max_completion_tokens
      {
        const maxComp = config.maxCompletionTokens ?? config.maxTokens ?? 1000;
        if (typeof maxComp === 'number') bodyConfig.max_completion_tokens = maxComp;
      }

      // Reasoning: Only send reasoning_effort for o-series models; omit nested `reasoning` entirely
      if (isReasoningModel(modelName) && !isGPT5Model(modelName)) {
        const effort = (config.reasoning && config.reasoning.effort) || config.reasoningEffort;
        if (effort) bodyConfig.reasoning_effort = effort;
      }

      return bodyConfig;
    },

    extractContent: (data: any) => {
      return data?.choices?.[0]?.delta?.content || null;
    },

  };
}; 