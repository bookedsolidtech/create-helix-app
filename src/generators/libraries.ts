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

# helix-responsive — starter responsive semantic mode (mobile / tablet /
# desktop). Per Charles Attisano (Helix design lead): every consumer of
# helix-tokens must declare a responsive mode. The CSS is loaded via @import
# from style.css, but registering it as a library lets you override or
# replace it with a custom breakpoint scheme without touching style.css.
helix-responsive:
  version: VERSION
  css:
    theme:
      css/helix-responsive.css: {}
  dependencies:
    - ${themeName}/global
`;
}
