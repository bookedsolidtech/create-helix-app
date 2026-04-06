import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  validateDirectory,
  validateFramework,
  validatePreset,
  validateThemeName,
  VALID_FRAMEWORKS,
  VALID_PRESETS,
} from '../validation.js';

// ---------------------------------------------------------------------------
// validateProjectName
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
  it('accepts a simple lowercase name', () => {
    expect(validateProjectName('my-app')).toBeUndefined();
  });

  it('accepts a name with digits', () => {
    expect(validateProjectName('app123')).toBeUndefined();
  });

  it('accepts a name with underscores', () => {
    expect(validateProjectName('my_app')).toBeUndefined();
  });

  it('accepts a name starting with a digit', () => {
    expect(validateProjectName('1app')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(validateProjectName('')).toBe('Project name is required');
  });

  it('rejects a whitespace-only string', () => {
    expect(validateProjectName('   ')).toBe('Project name is required');
  });

  it('rejects a name with a forward slash', () => {
    expect(validateProjectName('my/app')).toBe(
      'Project name cannot contain path separators (/ or \\)',
    );
  });

  it('rejects a name with a backslash', () => {
    expect(validateProjectName('my\\app')).toBe(
      'Project name cannot contain path separators (/ or \\)',
    );
  });

  it('rejects a name starting with a dot', () => {
    expect(validateProjectName('.hidden')).toBe('Project name cannot start with a dot');
  });

  it('rejects ".." as a project name', () => {
    expect(validateProjectName('..')).toBe('Project name cannot start with a dot');
  });

  it('rejects a name longer than 214 characters', () => {
    const longName = 'a'.repeat(215);
    expect(validateProjectName(longName)).toBe(
      'Project name must be 214 characters or fewer (npm limit)',
    );
  });

  it('accepts a name exactly 214 characters long', () => {
    const maxName = 'a'.repeat(214);
    expect(validateProjectName(maxName)).toBeUndefined();
  });

  it('rejects "node_modules" as a reserved name', () => {
    expect(validateProjectName('node_modules')).toMatch(/reserved name/);
  });

  it('rejects "favicon.ico" as a reserved name', () => {
    expect(validateProjectName('favicon.ico')).toMatch(/reserved name/);
  });

  it('rejects "__proto__" as a reserved name', () => {
    expect(validateProjectName('__proto__')).toMatch(/reserved name/);
  });

  it('rejects "constructor" as a reserved name', () => {
    expect(validateProjectName('constructor')).toMatch(/reserved name/);
  });

  it('rejects "prototype" as a reserved name', () => {
    expect(validateProjectName('prototype')).toMatch(/reserved name/);
  });

  it('rejects uppercase letters', () => {
    expect(validateProjectName('MyApp')).toMatch(/lowercase/);
  });

  it('rejects a name with spaces', () => {
    expect(validateProjectName('my app')).toMatch(/lowercase/);
  });

  it('rejects a name with special characters', () => {
    expect(validateProjectName('my@app')).toMatch(/lowercase/);
  });

  it('rejects a name with a dollar sign', () => {
    expect(validateProjectName('$app')).toMatch(/lowercase/);
  });
});

// ---------------------------------------------------------------------------
// validateDirectory
// ---------------------------------------------------------------------------

describe('validateDirectory', () => {
  it('accepts a simple relative path', () => {
    expect(validateDirectory('my-project')).toBeUndefined();
  });

  it('accepts an absolute path', () => {
    expect(validateDirectory('/home/user/projects')).toBeUndefined();
  });

  it('accepts a nested relative path', () => {
    expect(validateDirectory('projects/my-app')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(validateDirectory('')).toBe('Directory path is required');
  });

  it('rejects a whitespace-only string', () => {
    expect(validateDirectory('   ')).toBe('Directory path is required');
  });

  it('rejects a path containing a null byte', () => {
    expect(validateDirectory('my-project\0hack')).toBe('Directory path cannot contain null bytes');
  });

  it('rejects a path containing non-printable ASCII characters', () => {
    expect(validateDirectory('my\x01project')).toMatch(/non-printable/);
  });

  it('rejects a path with ../ traversal sequence', () => {
    expect(validateDirectory('../etc/passwd')).toMatch(/traversal/);
  });

  it('rejects a path with ..\\ traversal sequence', () => {
    expect(validateDirectory('..\\windows\\system32')).toMatch(/traversal/);
  });

  it('rejects a bare ".."', () => {
    expect(validateDirectory('..')).toMatch(/traversal|cannot be/);
  });

  it('rejects a path where a segment is ".."', () => {
    expect(validateDirectory('projects/../../../etc')).toMatch(/traversal/);
  });
});

// ---------------------------------------------------------------------------
// validateFramework
// ---------------------------------------------------------------------------

describe('validateFramework', () => {
  it('returns true for every valid framework id', () => {
    for (const fw of VALID_FRAMEWORKS) {
      expect(validateFramework(fw)).toBe(true);
    }
  });

  it('returns false for an empty string', () => {
    expect(validateFramework('')).toBe(false);
  });

  it('returns false for an unknown framework', () => {
    expect(validateFramework('django')).toBe(false);
  });

  it('returns false for a near-miss framework id', () => {
    expect(validateFramework('react')).toBe(false);
  });

  it('returns false for an uppercase variant of a valid framework', () => {
    expect(validateFramework('React-Next')).toBe(false);
  });

  it('VALID_FRAMEWORKS contains the expected 15 entries', () => {
    expect(VALID_FRAMEWORKS).toHaveLength(15);
  });

  it('VALID_FRAMEWORKS includes react-next', () => {
    expect(VALID_FRAMEWORKS).toContain('react-next');
  });

  it('VALID_FRAMEWORKS includes stencil', () => {
    expect(VALID_FRAMEWORKS).toContain('stencil');
  });
});

// ---------------------------------------------------------------------------
// validatePreset
// ---------------------------------------------------------------------------

describe('validatePreset', () => {
  it('returns true for every valid preset id', () => {
    for (const preset of VALID_PRESETS) {
      expect(validatePreset(preset)).toBe(true);
    }
  });

  it('returns false for an empty string', () => {
    expect(validatePreset('')).toBe(false);
  });

  it('returns false for an unknown preset', () => {
    expect(validatePreset('enterprise')).toBe(false);
  });

  it('returns false for an uppercase variant', () => {
    expect(validatePreset('Standard')).toBe(false);
  });

  it('VALID_PRESETS contains the expected 5 entries', () => {
    expect(VALID_PRESETS).toHaveLength(5);
  });

  it('VALID_PRESETS includes ecommerce', () => {
    expect(VALID_PRESETS).toContain('ecommerce');
  });
});

// ---------------------------------------------------------------------------
// validateThemeName
// ---------------------------------------------------------------------------

describe('validateThemeName', () => {
  it('accepts a simple lowercase theme name', () => {
    expect(validateThemeName('my-theme')).toBeUndefined();
  });

  it('accepts a theme name with underscores', () => {
    expect(validateThemeName('my_theme')).toBeUndefined();
  });

  it('accepts a theme name with digits after the first character', () => {
    expect(validateThemeName('theme2')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(validateThemeName('')).toBe('Theme name is required');
  });

  it('rejects a whitespace-only string', () => {
    expect(validateThemeName('   ')).toBe('Theme name is required');
  });

  it('rejects a name longer than 128 characters', () => {
    const longName = 'a'.repeat(129);
    expect(validateThemeName(longName)).toBe('Theme name must be 128 characters or fewer');
  });

  it('accepts a name exactly 128 characters long', () => {
    const maxName = 'a'.repeat(128);
    expect(validateThemeName(maxName)).toBeUndefined();
  });

  it('rejects a name containing a null byte', () => {
    expect(validateThemeName('my\0theme')).toBe('Theme name cannot contain null bytes');
  });

  it('rejects a name starting with a digit', () => {
    expect(validateThemeName('1theme')).toMatch(/lowercase/);
  });

  it('rejects uppercase letters', () => {
    expect(validateThemeName('MyTheme')).toMatch(/lowercase/);
  });

  it('rejects a name with special characters', () => {
    expect(validateThemeName('my@theme')).toMatch(/lowercase/);
  });

  it('rejects a name with spaces', () => {
    expect(validateThemeName('my theme')).toMatch(/lowercase/);
  });
});
