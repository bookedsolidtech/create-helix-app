/**
 * Visual inspection script for Drupal scaffold output.
 *
 * Scaffolds one or all presets into /tmp/helix-drupal/ and prints a
 * grouped file tree so you can inspect the generated structure.
 *
 * Usage:
 *   npx tsx test-drupal-scaffold.ts                    # all 5 presets
 *   npx tsx test-drupal-scaffold.ts --preset standard  # one preset
 *   npx tsx test-drupal-scaffold.ts --docker standard  # scaffold + docker up
 */

import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { scaffoldDrupalTheme } from './src/generators/drupal-theme.js';
import type { DrupalPreset } from './src/types.js';

const ALL_PRESETS: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet', 'ecommerce'];
const OUT_DIR = '/tmp/helix-drupal';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const presetFlagIdx = args.indexOf('--preset');
const dockerFlagIdx = args.indexOf('--docker');

let presetsToRun: DrupalPreset[] = ALL_PRESETS;
let dockerPreset: DrupalPreset | null = null;

if (presetFlagIdx !== -1 && args[presetFlagIdx + 1]) {
  presetsToRun = [args[presetFlagIdx + 1] as DrupalPreset];
}

if (dockerFlagIdx !== -1 && args[dockerFlagIdx + 1]) {
  dockerPreset = args[dockerFlagIdx + 1] as DrupalPreset;
  presetsToRun = [dockerPreset];
}

// ---------------------------------------------------------------------------
// File tree printer
// ---------------------------------------------------------------------------

function printTree(dir: string, prefix = '', maxDepth = 4, depth = 0): void {
  if (depth > maxDepth) return;
  const entries = fs.readdirSync(dir).sort();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const full = path.join(dir, entry);
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      console.log(`${prefix}${connector}${entry}/`);
      printTree(full, prefix + (isLast ? '    ' : '│   '), maxDepth, depth + 1);
    } else {
      const size = (stat.size / 1024).toFixed(1);
      console.log(`${prefix}${connector}${entry} (${size}k)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await fs.ensureDir(OUT_DIR);

  for (const presetId of presetsToRun) {
    const themeDir = path.join(OUT_DIR, presetId);
    const themeName = `helix_${presetId}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Preset: ${presetId.toUpperCase()} → ${themeDir}`);
    console.log('='.repeat(60));

    // Clean previous run
    await fs.remove(themeDir);

    await scaffoldDrupalTheme({
      themeName,
      directory: themeDir,
      preset: presetId,
    });

    console.log(`\n${themeName}/`);
    printTree(themeDir);

    // Count SDCs per group
    const componentsDir = path.join(themeDir, 'components');
    if (fs.existsSync(componentsDir)) {
      const groups = fs.readdirSync(componentsDir);
      console.log('\n  SDC Groups:');
      for (const group of groups.sort()) {
        const sdcs = fs.readdirSync(path.join(componentsDir, group));
        console.log(`    ${group}/ → ${sdcs.length} SDC(s): ${sdcs.join(', ')}`);
      }
    }

    // Count template overrides
    const templatesDir = path.join(themeDir, 'templates');
    if (fs.existsSync(templatesDir)) {
      const countFiles = (d: string): number =>
        fs
          .readdirSync(d)
          .reduce(
            (n, e) =>
              n + (fs.statSync(path.join(d, e)).isDirectory() ? countFiles(path.join(d, e)) : 1),
            0,
          );
      console.log(`  Template overrides: ${countFiles(templatesDir)}`);
    }

    console.log(`\n  ✓ Scaffolded to ${themeDir}`);
  }

  // Docker mode
  if (dockerPreset) {
    const themeDir = path.join(OUT_DIR, dockerPreset);
    const dockerDir = path.join(themeDir, 'docker');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Docker mode: ${dockerPreset}`);
    console.log('='.repeat(60));
    console.log('\n  Starting docker compose...');
    try {
      execSync('docker compose up -d', { cwd: dockerDir, stdio: 'inherit' });
      console.log(`\n  ✓ Drupal 11 booting at http://localhost:8080`);
      console.log(`\n  To install Drupal, run:`);
      console.log(
        `    docker compose exec drupal bash /opt/drupal/web/themes/custom/helix_${dockerPreset}/docker/scripts/setup-drupal.sh`,
      );
      console.log(`\n  To stop:`);
      console.log(`    cd ${dockerDir} && docker compose down`);
    } catch {
      console.error('  ✗ docker compose failed — is Docker running?');
      process.exit(1);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Done! All output in ${OUT_DIR}`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
