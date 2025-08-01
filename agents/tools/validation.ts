import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new (Ajv as any)();
(addFormats as any)(ajv);

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const validateToolCall = (toolCall: any, tool: any): ValidationResult => {
  if (!tool.inputSchema) {
    return { valid: true };
  }

  const validate = ajv.compile(tool.inputSchema);
  const valid = validate(toolCall.arguments);

  if (!valid) {
    return { valid: false, error: ajv.errorsText(validate.errors) };
  }

  return { valid: true };
};