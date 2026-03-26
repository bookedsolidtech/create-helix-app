import { describe, it, expect } from 'vitest';

function parseVersionFlag(args: string[]): boolean {
  return args.includes('--version') || args.includes('-v');
}

describe('--version / -v flag argument parsing', () => {
  it('detects --version flag', () => {
    expect(parseVersionFlag(['--version'])).toBe(true);
  });

  it('detects -v flag', () => {
    expect(parseVersionFlag(['-v'])).toBe(true);
  });

  it('returns false when neither flag is present', () => {
    expect(parseVersionFlag(['my-app', '--template', 'react-next'])).toBe(false);
  });

  it('detects --version among other flags', () => {
    expect(parseVersionFlag(['my-app', '--version', '--force'])).toBe(true);
  });

  it('detects -v among other flags', () => {
    expect(parseVersionFlag(['my-app', '-v', '--force'])).toBe(true);
  });
});
