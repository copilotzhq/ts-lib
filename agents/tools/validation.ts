import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new (Ajv as any)();
(addFormats as any)(ajv);

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const validateToolCall = (toolCall: any, tool: any): ValidationResult => {
  // If no input schema is defined, any input is valid
  if (!tool.inputSchema) {
    return { valid: true };
  }

  // Handle undefined or null arguments
  const args = toolCall.arguments || {};
  
  // If the schema has no properties and no required fields, accept empty arguments
  if (tool.inputSchema.type === 'object' && 
      (!tool.inputSchema.properties || Object.keys(tool.inputSchema.properties).length === 0) &&
      (!tool.inputSchema.required || tool.inputSchema.required.length === 0)) {
    return { valid: true };
  }

  try {
    const validate = ajv.compile(tool.inputSchema);
    const valid = validate(args);

    if (!valid) {
      const errorMessage = ajv.errorsText(validate.errors);
      return { valid: false, error: errorMessage };
    }

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: `Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};