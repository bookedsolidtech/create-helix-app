import type { PresetConfig } from '../types.js';

/**
 * Generates {themeName}.libraries.yml content.
 *
 * SDCs load their own HELiX component assets via attach_library() calls in
 * their Twig templates. This file only declares global theme-level CSS.
 */
export function generateThemeLibraries(themeName: string, _preset: PresetConfig): string {
  return `global:
  version: VERSION
  css:
    theme:
      css/style.css: {}
  dependencies:
    - core/drupal

helix-overrides:
  version: VERSION
  css:
    theme:
      css/helix-overrides.css: {}
  dependencies:
    - ${themeName}/global
`;
}
