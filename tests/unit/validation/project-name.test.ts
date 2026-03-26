import { describe, it, expect } from 'vitest';
import { validateProjectName } from '../../../src/validation.js';

describe('validateProjectName — valid names', () => {
  it('accepts a simple lowercase name', () => {
    expect(validateProjectName('my-app')).toBeUndefined();
  });

  it('accepts a name with only lowercase letters', () => {
    expect(validateProjectName('myapp')).toBeUndefined();
  });

  it('accepts a name with hyphens', () => {
    expect(validateProjectName('my-helix-app')).toBeUndefined();
  });

  it('accepts a name with underscores', () => {
    expect(validateProjectName('my_helix_app')).toBeUndefined();
  });

  it('accepts a name with numbers', () => {
    expect(validateProjectName('app2')).toBeUndefined();
  });

  it('accepts a single lowercase letter', () => {
    expect(validateProjectName('a')).toBeUndefined();
  });

  it('accepts a single digit', () => {
    expect(validateProjectName('1')).toBeUndefined();
  });

  it('accepts a name that starts with a digit', () => {
    expect(validateProjectName('2cool')).toBeUndefined();
  });

  it('accepts a name at exactly 214 characters', () => {
    const name = 'a'.repeat(210) + '-pkg';
    expect(validateProjectName(name)).toBeUndefined();
  });

  it('accepts mixed hyphens, underscores, and numbers', () => {
    expect(validateProjectName('app-v2_final')).toBeUndefined();
  });
});

describe('validateProjectName — empty / whitespace', () => {
  it('rejects an empty string', () => {
    expect(validateProjectName('')).toBeTruthy();
  });

  it('rejects a whitespace-only string', () => {
    expect(validateProjectName('   ')).toBeTruthy();
  });

  it('rejects a tab-only string', () => {
    expect(validateProjectName('\t')).toBeTruthy();
  });
});

describe('validateProjectName — path separators', () => {
  it('rejects a name with a forward slash', () => {
    expect(validateProjectName('my/app')).toBeTruthy();
  });

  it('rejects a name with a backslash', () => {
    expect(validateProjectName('my\\app')).toBeTruthy();
  });

  it('rejects a path traversal sequence', () => {
    expect(validateProjectName('../evil')).toBeTruthy();
  });

  it('rejects a nested path', () => {
    expect(validateProjectName('foo/bar/baz')).toBeTruthy();
  });
});

describe('validateProjectName — dot prefix', () => {
  it('rejects a name starting with a single dot', () => {
    expect(validateProjectName('.hidden')).toBeTruthy();
  });

  it('rejects ".." (double dot)', () => {
    expect(validateProjectName('..')).toBeTruthy();
  });

  it('rejects "." (single dot)', () => {
    expect(validateProjectName('.')).toBeTruthy();
  });
});

describe('validateProjectName — uppercase and invalid characters', () => {
  it('rejects uppercase letters', () => {
    expect(validateProjectName('MyApp')).toBeTruthy();
  });

  it('rejects all-uppercase name', () => {
    expect(validateProjectName('MYAPP')).toBeTruthy();
  });

  it('rejects spaces in name', () => {
    expect(validateProjectName('my app')).toBeTruthy();
  });

  it('rejects leading space', () => {
    expect(validateProjectName(' myapp')).toBeTruthy();
  });

  it('rejects special characters like @', () => {
    expect(validateProjectName('@myapp')).toBeTruthy();
  });

  it('rejects exclamation mark', () => {
    expect(validateProjectName('my!app')).toBeTruthy();
  });

  it('rejects a dot in the middle (npm disallows)', () => {
    expect(validateProjectName('my.app')).toBeTruthy();
  });

  it('rejects tilde', () => {
    expect(validateProjectName('~myapp')).toBeTruthy();
  });

  it('rejects emoji', () => {
    expect(validateProjectName('my🚀app')).toBeTruthy();
  });

  it('rejects unicode letters', () => {
    expect(validateProjectName('myäpp')).toBeTruthy();
  });
});

describe('validateProjectName — length limit', () => {
  it('rejects a name of 215 characters', () => {
    const name = 'a'.repeat(215);
    expect(validateProjectName(name)).toBeTruthy();
  });

  it('rejects a very long name', () => {
    const name = 'a'.repeat(300);
    expect(validateProjectName(name)).toBeTruthy();
  });
});

describe('validateProjectName — reserved names', () => {
  it('rejects "node_modules"', () => {
    expect(validateProjectName('node_modules')).toBeTruthy();
  });

  it('rejects "favicon.ico"', () => {
    expect(validateProjectName('favicon.ico')).toBeTruthy();
  });

  it('rejects "__proto__"', () => {
    expect(validateProjectName('__proto__')).toBeTruthy();
  });

  it('rejects "constructor"', () => {
    expect(validateProjectName('constructor')).toBeTruthy();
  });

  it('rejects "prototype"', () => {
    expect(validateProjectName('prototype')).toBeTruthy();
  });
});
