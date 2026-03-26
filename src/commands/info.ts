import pc from 'picocolors';
import { TEMPLATES } from '../templates.js';
import { PRESETS } from '../presets/loader.js';

/**
 * Display detailed information about a template or Drupal preset.
 *
 * @param id   - The template or preset ID to look up.
 * @param json - When true, output compact JSON to stdout instead of TUI output.
 */
export function showTemplateInfo(id: string, json: boolean): void {
  const template = TEMPLATES.find((t) => t.id === id);
  if (template) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            type: 'template',
            id: template.id,
            name: template.name,
            description: template.description,
            hint: template.hint,
            dependencies: template.dependencies,
            devDependencies: template.devDependencies,
            features: template.features,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('');
    console.log(pc.bold('  ' + template.name));
    console.log(pc.dim('  ' + template.description));
    console.log('');
    console.log(pc.dim('  ID:   ') + pc.cyan(template.id));
    console.log(pc.dim('  Type: ') + pc.white('Framework Template'));
    console.log('');

    if (Object.keys(template.dependencies).length > 0) {
      console.log(pc.bold('  Dependencies'));
      for (const [pkg, version] of Object.entries(template.dependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (Object.keys(template.devDependencies).length > 0) {
      console.log(pc.bold('  Dev Dependencies'));
      for (const [pkg, version] of Object.entries(template.devDependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (template.features.length > 0) {
      console.log(pc.bold('  Features'));
      for (const feature of template.features) {
        console.log(`    ${pc.white('•')} ${feature}`);
      }
      console.log('');
    }
    return;
  }

  const preset = PRESETS.find((pr) => pr.id === id);
  if (preset) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            type: 'preset',
            id: preset.id,
            name: preset.name,
            description: preset.description,
            sdcList: preset.sdcList,
            dependencies: preset.dependencies,
            architectureNotes: preset.architectureNotes,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('');
    console.log(pc.bold('  ' + preset.name));
    console.log(pc.dim('  ' + preset.description));
    console.log('');
    console.log(pc.dim('  ID:   ') + pc.cyan(preset.id));
    console.log(pc.dim('  Type: ') + pc.white('Drupal Preset'));
    console.log('');

    if (preset.sdcList.length > 0) {
      console.log(pc.bold('  SDC Components'));
      for (const sdc of preset.sdcList) {
        console.log(`    ${pc.white('•')} ${sdc}`);
      }
      console.log('');
    }

    if (Object.keys(preset.dependencies).length > 0) {
      console.log(pc.bold('  Dependencies'));
      for (const [pkg, version] of Object.entries(preset.dependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (preset.architectureNotes) {
      console.log(pc.bold('  Architecture Notes'));
      console.log(`    ${pc.dim(preset.architectureNotes)}`);
      console.log('');
    }
    return;
  }

  // Not found — show error with suggestions
  const allIds = [...TEMPLATES.map((t) => t.id), ...PRESETS.map((pr) => pr.id)];
  const suggestions = allIds.filter(
    (availableId) => availableId.includes(id) || id.includes(availableId.split('-')[0]),
  );

  console.error(`Template or preset not found: "${id}"`);
  if (suggestions.length > 0) {
    console.error(`Did you mean: ${suggestions.join(', ')}?`);
  } else {
    console.error(`Available templates: ${TEMPLATES.map((t) => t.id).join(', ')}`);
    console.error(`Available presets: ${PRESETS.map((pr) => pr.id).join(', ')}`);
  }
  process.exit(1);
}
