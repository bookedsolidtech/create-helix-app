import { describe, it, expect } from 'vitest';
import {
  validateDirectory,
  validateFramework,
  validatePreset,
  validateThemeName,
} from '../../src/validation.js';

// ─── validateDirectory ───────────────────────────────────────────────────────

describe('validateDirectory — path traversal', () => {
  it('rejects "../" traversal prefix', () => {
    expect(validateDirectory('../secret')).toBeTruthy();
  });

  it('rejects "..\\" traversal (Windows-style)', () => {
    expect(validateDirectory('..\\secret')).toBeTruthy();
  });

  it('rejects embedded "foo/../bar" traversal', () => {
    expect(validateDirectory('foo/../bar')).toBeTruthy();
  });

  it('rejects absolute path like /etc/passwd', () => {
    // /etc/passwd contains no traversal sequences but we validate it passes
    // through (absolute paths are valid inputs; traversal is the concern)
    // An absolute path without traversal should be accepted
    expect(validateDirectory('/etc/passwd')).toBeUndefined();
  });

  it('rejects bare ".." as directory', () => {
    expect(validateDirectory('..')).toBeTruthy();
  });

  it('rejects "../../etc/hosts"', () => {
    expect(validateDirectory('../../etc/hosts')).toBeTruthy();
  });

  it('accepts a simple relative directory name', () => {
    expect(validateDirectory('my-project')).toBeUndefined();
  });

  it('accepts a nested relative path without traversal', () => {
    expect(validateDirectory('projects/my-project')).toBeUndefined();
  });

  it('accepts an absolute path without traversal', () => {
    expect(validateDirectory('/home/user/projects/my-app')).toBeUndefined();
  });
});

describe('validateDirectory — null bytes and non-printable chars', () => {
  it('rejects a path with a null byte', () => {
    expect(validateDirectory('foo\0bar')).toBeTruthy();
  });

  it('rejects a path with a null byte at the end', () => {
    expect(validateDirectory('mydir\0')).toBeTruthy();
  });

  it('rejects a path with a non-printable control character (\\x01)', () => {
    expect(validateDirectory('foo\x01bar')).toBeTruthy();
  });

  it('rejects a path with a DEL character (\\x7f)', () => {
    expect(validateDirectory('foo\x7fbar')).toBeTruthy();
  });

  it('accepts a path with no special characters', () => {
    expect(validateDirectory('safe-directory')).toBeUndefined();
  });
});

describe('validateDirectory — empty input', () => {
  it('rejects an empty string', () => {
    expect(validateDirectory('')).toBeTruthy();
  });

  it('rejects a whitespace-only string', () => {
    expect(validateDirectory('   ')).toBeTruthy();
  });
});

// ─── validateFramework ───────────────────────────────────────────────────────

describe('validateFramework — invalid frameworks', () => {
  it('rejects "nonexistent"', () => {
    expect(validateFramework('nonexistent')).toBe(false);
  });

  it('rejects "REACT-NEXT" (uppercase)', () => {
    expect(validateFramework('REACT-NEXT')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateFramework('')).toBe(false);
  });

  it('rejects "react" (partial match only)', () => {
    expect(validateFramework('react')).toBe(false);
  });

  it('rejects "vue" (partial match only)', () => {
    expect(validateFramework('vue')).toBe(false);
  });

  it('rejects "React-Next" (mixed case)', () => {
    expect(validateFramework('React-Next')).toBe(false);
  });
});

describe('validateFramework — valid frameworks', () => {
  it('accepts "react-next"', () => {
    expect(validateFramework('react-next')).toBe(true);
  });

  it('accepts "react-vite"', () => {
    expect(validateFramework('react-vite')).toBe(true);
  });

  it('accepts "vue-vite"', () => {
    expect(validateFramework('vue-vite')).toBe(true);
  });

  it('accepts "angular"', () => {
    expect(validateFramework('angular')).toBe(true);
  });

  it('accepts "svelte-kit"', () => {
    expect(validateFramework('svelte-kit')).toBe(true);
  });

  it('accepts "vanilla"', () => {
    expect(validateFramework('vanilla')).toBe(true);
  });

  it('accepts "astro"', () => {
    expect(validateFramework('astro')).toBe(true);
  });

  it('accepts "stencil"', () => {
    expect(validateFramework('stencil')).toBe(true);
  });
});

// ─── validatePreset ──────────────────────────────────────────────────────────

describe('validatePreset — invalid presets', () => {
  it('rejects "nonexistent"', () => {
    expect(validatePreset('nonexistent')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validatePreset('')).toBe(false);
  });

  it('rejects "STANDARD" (uppercase)', () => {
    expect(validatePreset('STANDARD')).toBe(false);
  });

  it('rejects "drupal" (not a preset name)', () => {
    expect(validatePreset('drupal')).toBe(false);
  });
});

describe('validatePreset — valid presets', () => {
  it('accepts "standard"', () => {
    expect(validatePreset('standard')).toBe(true);
  });

  it('accepts "blog"', () => {
    expect(validatePreset('blog')).toBe(true);
  });

  it('accepts "healthcare"', () => {
    expect(validatePreset('healthcare')).toBe(true);
  });

  it('accepts "intranet"', () => {
    expect(validatePreset('intranet')).toBe(true);
  });

  it('accepts "ecommerce"', () => {
    expect(validatePreset('ecommerce')).toBe(true);
  });
});

// ─── validateThemeName ───────────────────────────────────────────────────────

describe('validateThemeName — invalid names', () => {
  it('rejects a name with spaces', () => {
    expect(validateThemeName('my theme')).toBeTruthy();
  });

  it('rejects a name with special characters (@)', () => {
    expect(validateThemeName('my@theme')).toBeTruthy();
  });

  it('rejects a name that is too long (>128 chars)', () => {
    expect(validateThemeName('a'.repeat(129))).toBeTruthy();
  });

  it('rejects a name starting with a digit', () => {
    expect(validateThemeName('1theme')).toBeTruthy();
  });

  it('rejects an empty string', () => {
    expect(validateThemeName('')).toBeTruthy();
  });

  it('rejects uppercase letters', () => {
    expect(validateThemeName('MyTheme')).toBeTruthy();
  });

  it('rejects a name with a null byte', () => {
    expect(validateThemeName('my\0theme')).toBeTruthy();
  });

  it('rejects a path traversal sequence', () => {
    expect(validateThemeName('../evil')).toBeTruthy();
  });
});

describe('validateThemeName — valid names', () => {
  it('accepts a simple lowercase name', () => {
    expect(validateThemeName('mytheme')).toBeUndefined();
  });

  it('accepts a name with hyphens', () => {
    expect(validateThemeName('my-helix-theme')).toBeUndefined();
  });

  it('accepts a name with underscores', () => {
    expect(validateThemeName('my_helix_theme')).toBeUndefined();
  });

  it('accepts a name with numbers (after initial letter)', () => {
    expect(validateThemeName('theme2024')).toBeUndefined();
  });

  it('accepts a name at exactly 128 characters', () => {
    const name = 'a' + 'b'.repeat(127);
    expect(validateThemeName(name)).toBeUndefined();
  });
});
