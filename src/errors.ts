/**
 * Structured error codes for create-helix.
 * Each code is unique and maps to a human-readable message and resolution suggestion.
 */
export enum ErrorCode {
  INVALID_TEMPLATE = 'HELIX_E001_INVALID_TEMPLATE',
  PATH_TRAVERSAL = 'HELIX_E002_PATH_TRAVERSAL',
  NETWORK_FAILURE = 'HELIX_E003_NETWORK_FAILURE',
  INVALID_PRESET = 'HELIX_E004_INVALID_PRESET',
  INVALID_BUNDLE = 'HELIX_E005_INVALID_BUNDLE',
  UNKNOWN_FRAMEWORK = 'HELIX_E006_UNKNOWN_FRAMEWORK',
  DISK_ERROR = 'HELIX_E007_DISK_ERROR',
  INVALID_DIRECTORY = 'HELIX_E008_INVALID_DIRECTORY',
}

const ERROR_SUGGESTIONS: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_TEMPLATE]: 'Run `create-helix list` to see available framework templates.',
  [ErrorCode.PATH_TRAVERSAL]:
    'Use a simple project name without path separators or traversal sequences (../).',
  [ErrorCode.NETWORK_FAILURE]:
    'Check your internet connection and try again. Use --no-install to skip dependency installation.',
  [ErrorCode.INVALID_PRESET]: 'Run `create-helix list` to see available Drupal presets.',
  [ErrorCode.INVALID_BUNDLE]: 'Run `create-helix list` to see available component bundles.',
  [ErrorCode.UNKNOWN_FRAMEWORK]: 'Run `create-helix list` to see available framework templates.',
  [ErrorCode.DISK_ERROR]: 'Check disk space and file permissions, then try again.',
  [ErrorCode.INVALID_DIRECTORY]:
    'Provide a valid directory path without traversal sequences or invalid characters.',
};

/**
 * Structured error for create-helix operations.
 * Includes a unique error code, human-readable message, resolution suggestion, and optional cause.
 */
export class HelixError extends Error {
  readonly code: ErrorCode;
  readonly suggestion: string;
  override readonly cause: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'HelixError';
    this.code = code;
    this.suggestion = ERROR_SUGGESTIONS[code];
    this.cause = cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HelixError);
    }
  }

  /**
   * Formats a verbose error output including the error code, message, suggestion,
   * full stack trace, and cause chain.
   */
  formatVerbose(): string {
    const lines: string[] = [`[${this.code}] ${this.message}`, `Suggestion: ${this.suggestion}`];

    if (this.stack) {
      lines.push('', 'Stack trace:');
      lines.push(this.stack);
    }

    if (this.cause !== undefined) {
      lines.push('', 'Caused by:');
      if (this.cause instanceof Error) {
        lines.push(this.cause.stack ?? this.cause.message);
      } else {
        lines.push(String(this.cause));
      }
    }

    return lines.join('\n');
  }
}
