import { describe, it, expect, afterEach } from 'vitest';
import { readEnvVars } from '../../src/config.js';

// Helper to set env vars and clean up after each test
function withEnv(vars: Record<string, string>, fn: () => void): void {
  const originals: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(vars)) {
    originals[key] = process.env[key];
    process.env[key] = val;
  }
  try {
    fn();
  } finally {
    for (const [key, orig] of Object.entries(originals)) {
      if (orig === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = orig;
      }
    }
  }
}

afterEach(() => {
  // Clean up all HELIX_ env vars that may have leaked
  const helixKeys = Object.keys(process.env).filter((k) => k.startsWith('HELIX_'));
  for (const key of helixKeys) {
    delete process.env[key];
  }
});

describe('readEnvVars', () => {
  // ─── Empty / no env vars ────────────────────────────────────────────────────

  describe('when no HELIX_ env vars are set', () => {
    it('returns an empty object', () => {
      const result = readEnvVars();
      expect(result).toEqual({});
    });
  });

  // ─── HELIX_TEMPLATE ─────────────────────────────────────────────────────────

  describe('HELIX_TEMPLATE', () => {
    it('maps HELIX_TEMPLATE to template field', () => {
      withEnv({ HELIX_TEMPLATE: 'react-next' }, () => {
        expect(readEnvVars().template).toBe('react-next');
      });
    });

    it('passes through the value without validation', () => {
      withEnv({ HELIX_TEMPLATE: 'vue-vite' }, () => {
        expect(readEnvVars().template).toBe('vue-vite');
      });
    });
  });

  // ─── HELIX_TYPESCRIPT ───────────────────────────────────────────────────────

  describe('HELIX_TYPESCRIPT boolean parsing', () => {
    it('parses "true" as true', () => {
      withEnv({ HELIX_TYPESCRIPT: 'true' }, () => {
        expect(readEnvVars().typescript).toBe(true);
      });
    });

    it('parses "1" as true', () => {
      withEnv({ HELIX_TYPESCRIPT: '1' }, () => {
        expect(readEnvVars().typescript).toBe(true);
      });
    });

    it('parses "yes" as true', () => {
      withEnv({ HELIX_TYPESCRIPT: 'yes' }, () => {
        expect(readEnvVars().typescript).toBe(true);
      });
    });

    it('parses "false" as false', () => {
      withEnv({ HELIX_TYPESCRIPT: 'false' }, () => {
        expect(readEnvVars().typescript).toBe(false);
      });
    });

    it('parses "0" as false', () => {
      withEnv({ HELIX_TYPESCRIPT: '0' }, () => {
        expect(readEnvVars().typescript).toBe(false);
      });
    });

    it('parses "no" as false', () => {
      withEnv({ HELIX_TYPESCRIPT: 'no' }, () => {
        expect(readEnvVars().typescript).toBe(false);
      });
    });

    it('returns undefined for unrecognized values', () => {
      withEnv({ HELIX_TYPESCRIPT: 'maybe' }, () => {
        expect(readEnvVars().typescript).toBeUndefined();
      });
    });

    it('is not set in result when env var is absent', () => {
      const result = readEnvVars();
      expect('typescript' in result).toBe(false);
    });
  });

  // ─── Boolean parsing is consistent across all boolean env vars ───────────────

  describe('boolean parsing for HELIX_ESLINT', () => {
    it('parses true values correctly', () => {
      withEnv({ HELIX_ESLINT: 'true' }, () => {
        expect(readEnvVars().eslint).toBe(true);
      });
    });

    it('parses false values correctly', () => {
      withEnv({ HELIX_ESLINT: 'false' }, () => {
        expect(readEnvVars().eslint).toBe(false);
      });
    });
  });

  describe('boolean parsing for HELIX_DARK_MODE', () => {
    it('parses true values correctly', () => {
      withEnv({ HELIX_DARK_MODE: '1' }, () => {
        expect(readEnvVars().darkMode).toBe(true);
      });
    });

    it('parses false values correctly', () => {
      withEnv({ HELIX_DARK_MODE: '0' }, () => {
        expect(readEnvVars().darkMode).toBe(false);
      });
    });
  });

  describe('boolean parsing for HELIX_TOKENS', () => {
    it('parses true values correctly', () => {
      withEnv({ HELIX_TOKENS: 'yes' }, () => {
        expect(readEnvVars().tokens).toBe(true);
      });
    });

    it('parses false values correctly', () => {
      withEnv({ HELIX_TOKENS: 'no' }, () => {
        expect(readEnvVars().tokens).toBe(false);
      });
    });
  });

  describe('boolean parsing for HELIX_VERBOSE', () => {
    it('parses "true" as true', () => {
      withEnv({ HELIX_VERBOSE: 'true' }, () => {
        expect(readEnvVars().verbose).toBe(true);
      });
    });

    it('parses "false" as false', () => {
      withEnv({ HELIX_VERBOSE: 'false' }, () => {
        expect(readEnvVars().verbose).toBe(false);
      });
    });
  });

  describe('boolean parsing for HELIX_OFFLINE', () => {
    it('parses "true" as true', () => {
      withEnv({ HELIX_OFFLINE: 'true' }, () => {
        expect(readEnvVars().offline).toBe(true);
      });
    });

    it('parses "false" as false', () => {
      withEnv({ HELIX_OFFLINE: 'false' }, () => {
        expect(readEnvVars().offline).toBe(false);
      });
    });
  });

  // ─── HELIX_BUNDLES ──────────────────────────────────────────────────────────

  describe('HELIX_BUNDLES comma-separated parsing', () => {
    it('parses a single bundle', () => {
      withEnv({ HELIX_BUNDLES: 'core' }, () => {
        expect(readEnvVars().bundles).toEqual(['core']);
      });
    });

    it('parses multiple comma-separated bundles', () => {
      withEnv({ HELIX_BUNDLES: 'core,forms,navigation' }, () => {
        expect(readEnvVars().bundles).toEqual(['core', 'forms', 'navigation']);
      });
    });

    it('trims whitespace from bundle values', () => {
      withEnv({ HELIX_BUNDLES: 'core, forms , layout' }, () => {
        expect(readEnvVars().bundles).toEqual(['core', 'forms', 'layout']);
      });
    });

    it('is not set in result when env var is absent', () => {
      const result = readEnvVars();
      expect('bundles' in result).toBe(false);
    });
  });

  // ─── HELIX_OUTPUT_DIR ───────────────────────────────────────────────────────

  describe('HELIX_OUTPUT_DIR', () => {
    it('maps HELIX_OUTPUT_DIR to outputDir field', () => {
      withEnv({ HELIX_OUTPUT_DIR: './my-output' }, () => {
        expect(readEnvVars().outputDir).toBe('./my-output');
      });
    });

    it('is not set in result when env var is absent', () => {
      const result = readEnvVars();
      expect('outputDir' in result).toBe(false);
    });
  });

  // ─── HELIX_PRESET ───────────────────────────────────────────────────────────

  describe('HELIX_PRESET', () => {
    it('maps HELIX_PRESET to preset field', () => {
      withEnv({ HELIX_PRESET: 'blog' }, () => {
        expect(readEnvVars().preset).toBe('blog');
      });
    });

    it('passes through the preset value', () => {
      withEnv({ HELIX_PRESET: 'healthcare' }, () => {
        expect(readEnvVars().preset).toBe('healthcare');
      });
    });
  });

  // ─── Multiple env vars at once ───────────────────────────────────────────────

  describe('multiple env vars set simultaneously', () => {
    it('reads all configured env vars in a single call', () => {
      withEnv(
        {
          HELIX_TEMPLATE: 'solid-vite',
          HELIX_TYPESCRIPT: 'true',
          HELIX_ESLINT: 'false',
          HELIX_DARK_MODE: '1',
          HELIX_TOKENS: 'no',
          HELIX_BUNDLES: 'core,forms',
          HELIX_OUTPUT_DIR: './dist',
          HELIX_PRESET: 'standard',
          HELIX_VERBOSE: 'true',
          HELIX_OFFLINE: '0',
        },
        () => {
          const result = readEnvVars();
          expect(result.template).toBe('solid-vite');
          expect(result.typescript).toBe(true);
          expect(result.eslint).toBe(false);
          expect(result.darkMode).toBe(true);
          expect(result.tokens).toBe(false);
          expect(result.bundles).toEqual(['core', 'forms']);
          expect(result.outputDir).toBe('./dist');
          expect(result.preset).toBe('standard');
          expect(result.verbose).toBe(true);
          expect(result.offline).toBe(false);
        },
      );
    });
  });
});
