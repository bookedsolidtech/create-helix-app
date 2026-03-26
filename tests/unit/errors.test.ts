import { describe, it, expect } from 'vitest';
import { HelixError, ErrorCode } from '../../src/errors.js';

describe('ErrorCode enum', () => {
  it('all error codes are unique', () => {
    const codes = Object.values(ErrorCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('error codes follow the HELIX_EXXX_ naming pattern', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(code).toMatch(/^HELIX_E\d{3}_/);
    }
  });
});

describe('HelixError', () => {
  it('is an instance of Error', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HelixError);
  });

  it('sets the name to HelixError', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'test');
    expect(err.name).toBe('HelixError');
  });

  it('stores the error code', () => {
    const err = new HelixError(ErrorCode.PATH_TRAVERSAL, 'path error');
    expect(err.code).toBe(ErrorCode.PATH_TRAVERSAL);
  });

  it('stores the message', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'bad template');
    expect(err.message).toBe('bad template');
  });

  it('stores the cause when provided', () => {
    const cause = new Error('original');
    const err = new HelixError(ErrorCode.DISK_ERROR, 'disk issue', cause);
    expect(err.cause).toBe(cause);
  });

  it('cause is undefined when not provided', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'test');
    expect(err.cause).toBeUndefined();
  });

  it('has a suggestion for every error code', () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new HelixError(code, 'test');
      expect(err.suggestion).toBeTruthy();
      expect(typeof err.suggestion).toBe('string');
      expect(err.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('has a stack trace', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'test');
    expect(err.stack).toBeTruthy();
  });
});

describe('HelixError.formatVerbose()', () => {
  it('includes the error code', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'bad template');
    const output = err.formatVerbose();
    expect(output).toContain(ErrorCode.INVALID_TEMPLATE);
  });

  it('includes the message', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'bad template');
    const output = err.formatVerbose();
    expect(output).toContain('bad template');
  });

  it('includes the suggestion', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'bad template');
    const output = err.formatVerbose();
    expect(output).toContain('Suggestion:');
    expect(output).toContain(err.suggestion);
  });

  it('includes "Stack trace:" header', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'bad template');
    const output = err.formatVerbose();
    expect(output).toContain('Stack trace:');
  });

  it('includes "Caused by:" section when cause is an Error', () => {
    const cause = new Error('root cause');
    const err = new HelixError(ErrorCode.DISK_ERROR, 'disk issue', cause);
    const output = err.formatVerbose();
    expect(output).toContain('Caused by:');
    expect(output).toContain('root cause');
  });

  it('includes "Caused by:" section when cause is a string', () => {
    const err = new HelixError(ErrorCode.DISK_ERROR, 'disk issue', 'string cause');
    const output = err.formatVerbose();
    expect(output).toContain('Caused by:');
    expect(output).toContain('string cause');
  });

  it('does not include "Caused by:" when there is no cause', () => {
    const err = new HelixError(ErrorCode.INVALID_TEMPLATE, 'test');
    const output = err.formatVerbose();
    expect(output).not.toContain('Caused by:');
  });
});

describe('suggestions exist for all error codes', () => {
  for (const code of Object.values(ErrorCode)) {
    it(`has a non-empty suggestion for ${code}`, () => {
      const err = new HelixError(code, 'test message');
      expect(err.suggestion).toBeTruthy();
      expect(err.suggestion.length).toBeGreaterThan(10);
    });
  }
});
