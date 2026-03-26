import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs-extra';
import { scaffoldDrupalTheme } from '../generators/drupal-theme.js';

const TEST_DIR = '/tmp/helix-test-drupal-security';

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

describe('scaffoldDrupalTheme — path traversal security', () => {
  it('throws on ".." relative traversal', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'mytheme',
        directory: '../evil',
        preset: 'standard',
      }),
    ).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on multi-level "../.." traversal', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'mytheme',
        directory: '../../etc/passwd',
        preset: 'standard',
      }),
    ).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on ".." segment in a relative path', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'mytheme',
        directory: 'themes/../../../secret',
        preset: 'standard',
      }),
    ).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on percent-encoded traversal that normalizes to ".."', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'mytheme',
        directory: '../%2e%2e/secret',
        preset: 'standard',
      }),
    ).rejects.toThrow(/traversal|Security/i);
  });

  it('does NOT throw for a safe directory path', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'mytheme',
        directory: `${TEST_DIR}/safe`,
        preset: 'standard',
      }),
    ).resolves.not.toThrow();
  });
});
