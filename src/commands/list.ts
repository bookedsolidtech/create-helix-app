import pc from 'picocolors';
import { TEMPLATES } from '../templates.js';
import { PRESETS } from '../presets/loader.js';

/**
 * Display all available framework templates and Drupal presets.
 *
 * v0.6.0 Phase C — templates flagged `experimental: true` are HIDDEN by
 * default. With `showExperimental: true`, output splits into a
 * "Production" section followed by an "Experimental" section so the
 * mental model stays clear. The default view appends a footer pointing
 * at the `--show-experimental` flag (DXA Q3 — triple-discoverability
 * point #1).
 *
 * @param json - When true, output compact JSON to stdout instead of TUI output.
 * @param showExperimental - When true, include experimental templates.
 */
export function listAll(json: boolean, showExperimental = false): void {
  const productionTemplates = TEMPLATES.filter((t) => !t.experimental);
  const experimentalTemplates = TEMPLATES.filter((t) => t.experimental);

  if (json) {
    const visibleFrameworks = showExperimental ? TEMPLATES : productionTemplates;
    const output = {
      frameworks: visibleFrameworks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        ...(t.experimental ? { experimental: true } : {}),
      })),
      presets: PRESETS.map((pr) => ({
        id: pr.id,
        name: pr.name,
        description: pr.description,
        sdcCount: pr.sdcList.length,
      })),
      ...(showExperimental ? {} : { experimentalHidden: experimentalTemplates.length }),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('');
  if (showExperimental) {
    console.log(pc.bold('  Framework Templates — Production'));
    console.log('');
    for (const t of productionTemplates) {
      console.log(
        `  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.description)}`,
      );
    }
    console.log('');
    console.log(pc.bold('  Framework Templates — Experimental'));
    console.log(pc.dim('  (stub-quality scaffolders; surfaced via --show-experimental)'));
    console.log('');
    for (const t of experimentalTemplates) {
      console.log(
        `  ${pc.yellow(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.description)}`,
      );
    }
  } else {
    console.log(pc.bold('  Framework Templates'));
    console.log('');
    for (const t of productionTemplates) {
      console.log(
        `  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.description)}`,
      );
    }
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

  if (!showExperimental && experimentalTemplates.length > 0) {
    // Footer hint — DXA Q3 triple-discoverability point #1. Pin via the
    // commands-list.test.ts contract so future copy edits don't drop the
    // flag name.
    console.log(
      pc.dim(
        `  ${String(experimentalTemplates.length)} experimental templates hidden. Use --show-experimental to see them.`,
      ),
    );
    console.log('');
  }
}
