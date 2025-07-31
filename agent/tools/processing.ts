
// this file will contain the logic for processing the tools.
// it will receive as input an array of tools (from the registry), and a tool call array (from the agent).
// tool call array is expected to be an array of objects, each with a "name" key, and a "arguments" key. "name" is the name of the tool to call, and "arguments" is an object with the arguments to pass to the tool.
// the processing logic will:
// 1. validate the input against the tool's input schema (if provided)
// 2. execute the tool
// 3. validate the output against the tool's output schema (if provided)
// 4. return the output
// 5. if the tool call is invalid, return an error
import { validateToolCall } from "./validation.ts";
import { RunnableTool, ToolExecutionContext } from "../Interfaces.ts";

/**
 * Calculate Levenshtein distance between two strings (for typo detection)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i] + 1,     // deletion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

export const processToolCalls = async (
  toolCalls: any[],
  agentTools: RunnableTool[] = [],
  context: ToolExecutionContext = {}
) => {
  const availableTools = agentTools.map(t => t.key).join(", ");
  
  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      // Handle malformed tool calls gracefully
      let name: string;
      let argsString: string;
      
      try {
        // Check if tool call has proper structure
        if (!toolCall.function) {
          // Check if it looks like the agent tried to call a tool directly
          const potentialToolName = Object.keys(toolCall).find(key => 
            agentTools.some(tool => tool.key === key)
          );
          
          let suggestion = "";
          if (potentialToolName) {
            suggestion = `\n\nDid you mean to call "${potentialToolName}"? Use this format:\n<tool_calls>\n{"function": {"name": "${potentialToolName}", "arguments": ${JSON.stringify(toolCall)}}}\n</tool_calls>`;
          } else {
            suggestion = `\n\nCorrect format example:\n<tool_calls>\n{"function": {"name": "create_thread", "arguments": {"name": "My Thread", "participants": ["Agent1"]}}}\n</tool_calls>`;
          }
          
          return {
            tool_call_id: toolCall.id || "unknown",
            name: "unknown",
            error: `MALFORMED TOOL CALL: Expected format {"function": {"name": "tool_name", "arguments": "..."}}. Available tools: [${availableTools}].${suggestion}`
          };
        }

        name = toolCall.function.name;
        argsString = toolCall.function.arguments;

        // Validate name exists
        if (!name) {
          return {
            tool_call_id: toolCall.id || "unknown",
            name: "unknown",
            error: `MISSING TOOL NAME: You must specify a tool name. Available tools: [${availableTools}]. Your call was: ${JSON.stringify(toolCall)}`
          };
        }

      } catch (error) {
        return {
          tool_call_id: toolCall.id || "unknown",
          name: "unknown",
          error: `INVALID TOOL CALL STRUCTURE: ${error instanceof Error ? error.message : String(error)}. Available tools: [${availableTools}]`
        };
      }

      // Find the tool
      const tool = agentTools.find((t) => t.key === name);

      if (!tool) {
        // Find similar tool names (typo detection)
        const similarTools = agentTools.filter(t => 
          t.key.toLowerCase().includes(name.toLowerCase()) || 
          name.toLowerCase().includes(t.key.toLowerCase()) ||
          levenshteinDistance(t.key.toLowerCase(), name.toLowerCase()) <= 2
        );
        
        let suggestion = "";
        if (similarTools.length > 0) {
          suggestion = `\n\nDid you mean: ${similarTools.map(t => `"${t.key}"`).join(", ")}?`;
        } else {
          suggestion = `\n\nExample usage:\n<tool_calls>\n{"function": {"name": "${agentTools[0]?.key || 'tool_name'}", "arguments": {...}}}\n</tool_calls>`;
        }
        
        return {
          tool_call_id: toolCall.id,
          name,
          error: `TOOL NOT FOUND: "${name}" is not available. Available tools: [${availableTools}].${suggestion}`,
        };
      }

      // Parse arguments
      let args;
      try {
        args = JSON.parse(argsString);
      } catch (e) {
        return {
          tool_call_id: toolCall.id,
          name,
          error: `INVALID JSON ARGUMENTS: The arguments must be valid JSON. Your arguments: ${argsString}. Error: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      // Validate tool call structure
      const validation = validateToolCall({ name, arguments: args }, tool);
      if (!validation.valid) {
        return {
          tool_call_id: toolCall.id,
          name,
          error: `VALIDATION ERROR: ${validation.error}. Please check the tool's required parameters and try again.`,
        };
      }

      // Execute the tool
      try {
        const output = await tool.execute(args, context);

        return {
          tool_call_id: toolCall.id,
          name,
          output,
        };
      } catch (error) {
        return {
          tool_call_id: toolCall.id,
          name,
          error: `EXECUTION ERROR: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    })
  );

  return results;
};