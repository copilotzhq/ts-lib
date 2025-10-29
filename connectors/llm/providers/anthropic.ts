import type { ProviderFactory, ProviderConfig, ChatMessage } from '../types.ts';

export const anthropicProvider: ProviderFactory = (config: ProviderConfig) => {
  const transformMessages = (messages: ChatMessage[]) => {
    // Anthropic requires system prompts to be separate from messages
    const systemPrompts: string[] = [];
    const userMessages: any[] = [];

    messages.forEach(msg => {
      if (msg.role === 'system') {
        systemPrompts.push(msg.content);
      } else {
        userMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    return {
      messages: userMessages,
      system: systemPrompts.join('\n') || undefined
    };
  };

  return {
    endpoint: 'https://api.anthropic.com/v1/messages',

    headers: (config: ProviderConfig) => ({
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey || '',
      'anthropic-version': '2023-06-01',
    }),

    transformMessages,

    body: (messages: ChatMessage[], config: ProviderConfig) => {
      const transformed = transformMessages(messages);

      return {
        model: config.model || 'claude-3-haiku-20240307',
        messages: transformed.messages,
        stream: true,
        temperature: config.temperature || 0,
        max_tokens: config.maxTokens || 1000,
        top_p: config.topP,
        top_k: config.topK,
        stop_sequences: config.stopSequences || config.stop,
        system: transformed.system,
        metadata: config.metadata,
      };
    },

    extractContent: (data: any) => {
      return data?.delta?.text || null;
    },

  };
}; 