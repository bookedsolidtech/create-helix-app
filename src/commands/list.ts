import pc from 'picocolors';
import { TEMPLATES } from '../templates.js';
import { PRESETS } from '../presets/loader.js';

/**
 * Display all available framework templates and Drupal presets.
 *
 * @param json - When true, output compact JSON to stdout instead of TUI output.
 */
export function listAll(json: boolean): void {
  if (json) {
    const output = {
      frameworks: TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
      presets: PRESETS.map((pr) => ({
        id: pr.id,
        name: pr.name,
        description: pr.description,
        sdcCount: pr.sdcList.length,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('');
  console.log(pc.bold('  Framework Templates'));
  console.log('');
  for (const t of TEMPLATES) {
    console.log(
      `  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.description)}`,
    );
  }

  console.log('');
  console.log(pc.bold('  Drupal Presets'));
  console.log('');
  for (const pr of PRESETS) {
    console.log(
      `  ${pc.cyan(pr.id.padEnd(18))} ${pc.white(pr.name.padEnd(26))} ${pc.dim(pr.description)} ${pc.dim(`(${String(pr.sdcList.length)} SDCs)`)}`,
    );
  }
  console.log('');
}
