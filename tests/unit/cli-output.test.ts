import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const cliBin = path.join(projectRoot, 'dist', 'index.js');

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };

function runCLI(args: string): string {
  return execSync(`node ${cliBin} ${args}`, { encoding: 'utf8' });
}

describe('--version flag', () => {
  it('outputs version matching package.json', () => {
    const output = runCLI('--version');
    expect(output.trim()).toBe(`create-helix v${pkg.version}`);
  });

  it('-v alias outputs version matching package.json', () => {
    const output = runCLI('-v');
    expect(output.trim()).toBe(`create-helix v${pkg.version}`);
  });
});

describe('--help flag', () => {
  let helpOutput: string;

  // Run once and reuse for all assertions
  helpOutput = runCLI('--help');

  it('includes all framework names', () => {
    const frameworks = [
      'react-next',
      'react-vite',
      'remix',
      'vue-nuxt',
      'vue-vite',
      'solid-vite',
      'qwik-vite',
      'svelte-kit',
      'angular',
      'astro',
      'vanilla',
      'lit-vite',
      'preact-vite',
      'stencil',
      'ember',
    ];
    for (const fw of frameworks) {
      expect(helpOutput).toContain(fw);
    }
  });

  it('includes create command description', () => {
    expect(helpOutput).toContain('create-helix');
    expect(helpOutput).toContain('npx create-helix');
  });

  it('includes upgrade command description', () => {
    expect(helpOutput).toContain('upgrade');
  });

  it('includes doctor command description', () => {
    // doctor is a subcommand — verify it appears in help context
    expect(helpOutput.toLowerCase()).toContain('doctor');
  });

  it('includes --version and --help option descriptions', () => {
    expect(helpOutput).toContain('--version');
    expect(helpOutput).toContain('--help');
    expect(helpOutput).toContain('Print version and exit');
    expect(helpOutput).toContain('Show this help message and exit');
  });

  it('includes framework selection option', () => {
    expect(helpOutput).toContain('--template');
    expect(helpOutput).toContain('Available frameworks');
  });

  it('includes drupal options section', () => {
    expect(helpOutput).toContain('--drupal');
    expect(helpOutput).toContain('--preset');
    expect(helpOutput).toContain('Available presets');
  });

  it('output is consistently formatted with version header', () => {
    expect(helpOutput).toContain(`create-helix v${pkg.version}`);
    expect(helpOutput).toContain('Usage:');
    expect(helpOutput).toContain('Options:');
  });
});
