import fs from "fs";
import { XMLValidator } from "fast-xml-parser";

export interface ValidationError {
  message: string;
  line?: number;
  col?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a .xp file's XML structure before it reaches the parser.
 * Returns structured errors with line/column info when available.
 */
export function validateXP(filePath: string): ValidationResult {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf-8");
  } catch {
    return {
      valid: false,
      errors: [{ message: `Cannot read file: ${filePath}` }],
    };
  }
  return validateSource(source);
}

export function validateSource(source: string): ValidationResult {
  const result = XMLValidator.validate(source, {
    allowBooleanAttributes: true,
  });

  if (result === true) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      {
        message: result.err.msg,
        line: result.err.line,
        col: result.err.col,
      },
    ],
  };
}
