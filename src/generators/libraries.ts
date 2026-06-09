import type { PresetConfig } from '../types.js';

/**
 * Generates {themeName}.libraries.yml content.
 *
 * SDCs load their own HELiX component assets via attach_library() calls in
 * their Twig templates. This file only declares global theme-level CSS.
 */
export function generateThemeLibraries(themeName: string, _preset: PresetConfig): string {
  return `# helix-tokens — upstream HELiX CSS variables vendored from
# @helixui/tokens by the postinstall copy script (scripts/copy-helix-tokens.mjs).
# 'global' depends on this so it always loads first; weight -200 also pins
# the cascade order so any other library can't accidentally override the
# token base layer. Loading this library is what makes
# var(--hx-color-text-primary, …) resolve to a real upstream value instead
# of the inline fallback.
helix-tokens:
  version: VERSION
  css:
    theme:
      css/vendor/helix-tokens.css: { weight: -200 }

global:
  version: VERSION
  css:
    theme:
      css/style.css: {}
  dependencies:
    - core/drupal
    - ${themeName}/helix-tokens

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
#
# Intentionally has NO dependency on 'global' — depending on 'global' would
# (a) load this stylesheet twice (global already @imports it from
# style.css) and (b) prevent consumers from swapping in a replacement
# responsive library without also detaching global, which defeats the
# documented "swap me out" extension point.
helix-responsive:
  version: VERSION
  css:
    theme:
      css/helix-responsive.css: {}
`;
}
