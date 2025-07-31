import { getEncoding } from "js-tiktoken";
import type { ChatMessage, ChatRequest, ChatResponse, ProviderConfig, ToolDefinition, ToolCall } from './types.ts';

/**
 * Formats chat messages with instructions and applies length limits
 */
export function formatMessages({ messages, instructions, config, tools }: ChatRequest): ChatMessage[] {

  // Build system content with instructions and tool definitions
  let systemContent = instructions || messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');

  
  // Add tool definitions to system prompt if tools are provided
  if (tools && tools.length > 0) {
    const toolSystemPrompt = generateToolSystemPrompt(tools);
    systemContent = systemContent
      ? `${systemContent}\n\n${toolSystemPrompt}`
      : toolSystemPrompt;
  }
  // Add system message if content exists
  const systemMessage: ChatMessage[] = systemContent
    ? [{ role: 'system', content: systemContent }]
    : [];

  let formattedMessages = [...systemMessage, ...messages.filter(m => m.role !== 'system')];

  // Apply length limit if specified
  if (config?.maxLength) {
    formattedMessages = limitMessageLength(
      formattedMessages,
      config.maxLength - (systemContent?.length || 0)
    );
  }

  // Ensure system message is first if it exists
  if (systemContent && formattedMessages[0]?.role !== 'system') {
    formattedMessages = [{ role: 'system', content: systemContent }, ...formattedMessages];
  }

  formattedMessages = formattedMessages.map((m) => ({
    ...m,
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.role === "tool" ?
      `Here's the result of the tool call id ${m.tool_call_id}: ${m.content}`
      : m.content
  }));

  return formattedMessages;
}

/**
 * Limits the total character length of messages, keeping the most recent ones
 */
function limitMessageLength(messages: ChatMessage[], limit: number): ChatMessage[] {
  const result: ChatMessage[] = [];
  let totalLength = 0;

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message.content) continue;

    const messageLength = message.content.length;

    if (totalLength + messageLength <= limit) {
      result.unshift(message);
      totalLength += messageLength;
    } else {
      // Truncate the message to fit remaining space
      const remainingSpace = limit - totalLength;
      if (remainingSpace > 0) {
        result.unshift({
          ...message,
          content: message.content.slice(-remainingSpace)
        });
      }
      break;
    }
  }

  return result;
}

/**
 * Counts tokens in messages and response using tiktoken
 */
export function countTokens(messages: ChatMessage[], response: string): number {
  try {
    const encoding = getEncoding("cl100k_base");
    const allContent = messages.map(m => m.content).join(' ') + response;
    const tokens = encoding.encode(allContent);
    return tokens.length;
  } catch (error) {
    console.warn('Token counting failed:', error);
    // Fallback to approximate count (4 chars per token)
    const totalText = messages.map(m => m.content).join(' ') + response;
    return Math.ceil(totalText.length / 4);
  }
}

/**
 * Creates a mock response for testing
 */
export function createMockResponse(request: ChatRequest): ChatResponse {
  const prompt = formatMessages(request);
  const answer = typeof request.answer === 'string'
    ? request.answer
    : JSON.stringify(request.answer);

  return {
    prompt,
    answer,
    tokens: 0
  };
}

/**
 * Parses Server-Sent Events data
 */
export function parseSSEData(line: string): any | null {
  if (!line.startsWith('data:')) return null;

  const data = line.slice(5).trim();
  if (data === '[DONE]') return null;

  try {
    return JSON.parse(data);
  } catch (error) {
    console.warn('Failed to parse SSE data:', error, 'Line:', line);
    return null;
  }
}

/**
 * Processes streaming response chunks
 */
export async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void,
  extractContent: (data: any) => string | null
): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  let fullResponse = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffered data
        if (buffer) {
          processBufferedLines(buffer, onChunk, extractContent, (content) => {
            fullResponse += content;
          });
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      lines.forEach(line => {
        const data = parseSSEData(line);
        if (data) {
          const content = extractContent(data);
          if (content) {
            onChunk(content);
            fullResponse += content;
          }
        }
      });
    }
  } catch (error) {
    console.error('Stream processing error:', error);
    throw error;
  }

  return fullResponse;
}

function processBufferedLines(
  buffer: string,
  onChunk: (chunk: string) => void,
  extractContent: (data: any) => string | null,
  onContent: (content: string) => void
): void {
  const lines = buffer.split('\n');
  lines.forEach(line => {
    const data = parseSSEData(line);
    if (data) {
      const content = extractContent(data);
      if (content) {
        onChunk(content);
        onContent(content);
      }
    }
  });
}

// =============================================================================
// STANDARDIZED TOOL CALLING FUNCTIONS
// =============================================================================

export function generateToolSystemPrompt(tools: ToolDefinition[]): string {
  const toolDefinitions = tools.map(tool => JSON.stringify(tool)).join('\n');

  return `
=== TOOL USAGE ===

In this environment you have access to a set of tools you can use to answer the user's question.

=== RULES ===

1. You may talk to the human normally and call tools in the same response.
2. If a tool is needed, produce JSONL objects between <tool_calls> … </tool_calls>.  
   • Required keys: "name", "arguments"  
   • No extra keys.  
3. Do not wrap the JSON in markdown fences or add other braces.  
4. Example:
<tool_calls>
{"name": "tool_name", "arguments": { "arg_1": "value_1", "arg_2": "value_2" } }
{"name": "tool_name_2","arguments": { "arg_1": "value_1", "arg_2": "value_2"} }
</tool_calls>


=== TOOL CATALOG (read-only) ===

\`\`\`json
${toolDefinitions}
\`\`\``;
}

/**
 * Parse tool calls from AI response using the Anthropic-style <tool_calls> JSON block
 */
export function parseToolCallsFromResponse(response: string): { cleanResponse: string; tool_calls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  let cleanResponse = response;

  // Regex to match <tool_calls> ... </tool_calls> block(s)
  const toolCallsPattern = /<tool_calls>([\s\S]*?)<\/tool_calls>/g;

  // Find all <tool_calls> blocks
  const matches = [...response.matchAll(toolCallsPattern)];

  for (const match of matches) {
    const blockContent = match[1].trim();

    // Parse JSON objects with proper bracket matching
    const jsonObjects = extractJsonObjects(blockContent);
    const updatedJsonObjects: string[] = [];

    for (const jsonStr of jsonObjects) {
      try {
        // Parse the JSON object
        const obj = JSON.parse(jsonStr);

        // Validate required keys
        if (obj && typeof obj.name === 'string') {
          // Generate unique execution ID for this tool call
          const executionId = crypto.randomUUID();

          // Add executionId to the original tool call object for future reference
          const enhancedObj = {
            ...obj,
            tool_call_id: executionId  // Add execution ID to original object
          };

          // Store the enhanced JSON string for response modification
          updatedJsonObjects.push(JSON.stringify(enhancedObj, null, 2));

          // Create tool call for execution
          toolCalls.push({
            id: executionId,
            function: {
              name: obj.name,
              arguments: JSON.stringify(obj.arguments)
            }
          });
        }
      } catch (err) {
        // Keep invalid JSON objects unchanged
        updatedJsonObjects.push(jsonStr);
        continue;
      }
    }

    // Reconstruct the enhanced tool_calls block with execution IDs
    if (updatedJsonObjects.length > 0) {
      const enhancedBlockContent = updatedJsonObjects.join('\n');
      const enhancedBlock = `<tool_calls>\n${enhancedBlockContent}\n</tool_calls>`;

      // Replace the original block with the enhanced version containing execution IDs
      cleanResponse = cleanResponse.replace(match[0], enhancedBlock);
    }
  }

  return { cleanResponse, tool_calls: toolCalls };
}

/**
 * Extract complete JSON objects from a string using proper bracket matching
 */
function extractJsonObjects(content: string): string[] {
  const jsonObjects: string[] = [];
  let i = 0;

  while (i < content.length) {
    // Skip whitespace
    while (i < content.length && /\s/.test(content[i])) {
      i++;
    }

    if (i >= content.length) break;

    // Look for opening brace
    if (content[i] === '{') {
      const startPos = i;
      let braceCount = 1;
      i++; // Move past the opening brace

      // Find the matching closing brace
      while (i < content.length && braceCount > 0) {
        if (content[i] === '{') {
          braceCount++;
        } else if (content[i] === '}') {
          braceCount--;
        } else if (content[i] === '"') {
          // Skip quoted strings to avoid counting braces inside strings
          i++;
          while (i < content.length && content[i] !== '"') {
            if (content[i] === '\\') {
              i++; // Skip escaped character
            }
            i++;
          }
        }
        i++;
      }

      if (braceCount === 0) {
        // Found complete JSON object
        const jsonStr = content.slice(startPos, i);
        jsonObjects.push(jsonStr);
      }
    } else {
      // Skip non-JSON character
      i++;
    }
  }

  return jsonObjects;
}