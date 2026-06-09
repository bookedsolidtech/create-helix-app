import type { SceneEmission, SceneEmissionContext } from '../scenes.js';

/**
 * Tokens.stories.tsx (playground) emitter.
 *
 * Port of upstream `apps/storybook/stories/playground/Tokens.stories.tsx`
 * with two adaptations:
 *
 * 1. Tag substitution — every literal `hx-*` in the Lit template is
 *    rewritten to the consumer's `{ds}-*`. Component-registry imports
 *    under `@helixui/library/components/hx-*` stay literal.
 *
 * 2. Domain-neutral demo content — upstream's playground demo block
 *    referenced healthcare-specific copy ("Patient ID" placeholder,
 *    "Cardiology" / "Anthem PPO" / "Telehealth" tags, the
 *    "MRN-849172 · 36y · Cardiology follow-up" card body, "Open chart"
 *    button, "Two records merged · Reviewed by Dr. Park" alert). All
 *    rewritten to a generic SaaS team-tool example — workspace member
 *    chips, account ID, project handoff card, undo-toast alert.
 *
 * The argTypes (every `--hx-color-*`, `--hx-border-radius-*`,
 * `--hx-space-*`, `--hx-font-size-*` control) port verbatim — those
 * reference the upstream `@helixui/tokens` package the consumer pulls
 * in, not anything healthcare-specific.
 *
 * Title taxonomy: `Foundations/Tokens/Playground` per the plan
 * (replaces upstream's `Playground/Tokens` which would have orphaned
 * under a separate top-level `Playground` namespace).
 *
 * Emit path: `src/stories/foundations/tokens/Tokens.stories.tsx` —
 * lives alongside the Borders.mdx + Shadows.mdx deep-dives and the
 * existing `src/stories/foundations/Tokens.mdx` index page (the latter
 * stays put one directory up; the title-path hierarchy is what nests
 * them in the sidebar).
 */
export function emitTokensPlaygroundScene({ dsName }: SceneEmissionContext): SceneEmission {
  const ds = dsName;
  return {
    relativePath: 'src/stories/foundations/tokens/Tokens.stories.tsx',
    content: `/**
 * Tokens.stories.tsx — Live token playground
 *
 * Storybook's Controls panel replaces the spec-sheet sticky-sidebar
 * control rail. Each control mutates a \`--hx-*\` custom property on
 * \`:root\` (or \`--play-*\` scoped to the demo surface). The demo
 * renders a small set of representative \`${ds}-*\` components (button,
 * card, input, alert) that consume the overridden tokens through the
 * standard three-tier cascade.
 */

import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';

import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-alert';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-tag';

interface PlaygroundArgs {
  primary500: string;
  primary600: string;
  primary700: string;
  error500: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  space2: string;
  space3: string;
  space4: string;
  space6: string;
  fontSizeMd: string;
}

const meta = {
  title: 'Foundations/Tokens/Playground',
  parameters: {
    docs: {
      description: {
        component:
          'Live token playground. Move a slider — every ${ds}-* component on the canvas reflows. ' +
          \`This is the cascade contract in action: components consume \\\`action.*\\\` and \\\`surface.*\\\`, \` +
          \`you override at \\\`:root\\\`, the system reflows.\`,
      },
    },
  },
  argTypes: {
    primary500: {
      name: '--hx-color-primary-500',
      control: { type: 'color' },
      description: 'Primary ramp · stop 500 (rest)',
      table: { category: 'Color · primary' },
    },
    primary600: {
      name: '--hx-color-primary-600',
      control: { type: 'color' },
      description: 'Primary ramp · stop 600 (default action bg)',
      table: { category: 'Color · primary' },
    },
    primary700: {
      name: '--hx-color-primary-700',
      control: { type: 'color' },
      description: 'Primary ramp · stop 700 (hover)',
      table: { category: 'Color · primary' },
    },
    error500: {
      name: '--hx-color-error-500',
      control: { type: 'color' },
      description: 'Error ramp · stop 500',
      table: { category: 'Color · status' },
    },
    radiusSm: {
      name: '--hx-border-radius-sm',
      control: { type: 'range', min: 0, max: 16, step: 1 },
      description: 'Border radius · small (chips, badges)',
      table: { category: 'Shape' },
    },
    radiusMd: {
      name: '--hx-border-radius-md',
      control: { type: 'range', min: 0, max: 24, step: 1 },
      description: 'Border radius · medium (buttons, inputs)',
      table: { category: 'Shape' },
    },
    radiusLg: {
      name: '--hx-border-radius-lg',
      control: { type: 'range', min: 0, max: 32, step: 1 },
      description: 'Border radius · large (cards, dialogs)',
      table: { category: 'Shape' },
    },
    space2: {
      name: '--hx-space-2',
      control: { type: 'range', min: 0, max: 16, step: 1 },
      description: 'Spacing scale · step 2',
      table: { category: 'Spacing' },
    },
    space3: {
      name: '--hx-space-3',
      control: { type: 'range', min: 0, max: 24, step: 1 },
      description: 'Spacing scale · step 3',
      table: { category: 'Spacing' },
    },
    space4: {
      name: '--hx-space-4',
      control: { type: 'range', min: 0, max: 32, step: 1 },
      description: 'Spacing scale · step 4 (default padding)',
      table: { category: 'Spacing' },
    },
    space6: {
      name: '--hx-space-6',
      control: { type: 'range', min: 0, max: 48, step: 1 },
      description: 'Spacing scale · step 6 (section gap)',
      table: { category: 'Spacing' },
    },
    fontSizeMd: {
      name: '--hx-font-size-md',
      control: { type: 'range', min: 13, max: 20, step: 1 },
      description: 'Body text size (px)',
      table: { category: 'Type' },
    },
  },
  args: {
    primary500: '#429797',
    primary600: '#0F7078',
    primary700: '#0A4F55',
    error500: '#E5493E',
    radiusSm: '4',
    radiusMd: '6',
    radiusLg: '12',
    space2: '8',
    space3: '12',
    space4: '16',
    space6: '24',
    fontSizeMd: '16',
  },
  render: (args) => {
    // Apply control values as CSS variables on the demo wrapper. Anything
    // descending from \`<div style="…">\` reads through the cascade — every
    // ${ds}-* component below picks up the override automatically.
    const styleVars: Record<string, string> = {
      '--hx-color-primary-500': args.primary500,
      '--hx-color-primary-600': args.primary600,
      '--hx-color-primary-700': args.primary700,
      '--hx-color-error-500': args.error500,
      '--hx-border-radius-sm': \`\${args.radiusSm}px\`,
      '--hx-border-radius-md': \`\${args.radiusMd}px\`,
      '--hx-border-radius-lg': \`\${args.radiusLg}px\`,
      '--hx-space-2': \`\${args.space2}px\`,
      '--hx-space-3': \`\${args.space3}px\`,
      '--hx-space-4': \`\${args.space4}px\`,
      '--hx-space-6': \`\${args.space6}px\`,
      '--hx-font-size-md': \`\${args.fontSizeMd}px\`,
    };
    const styleString = Object.entries(styleVars)
      .map(([k, v]) => \`\${k}: \${v}\`)
      .join('; ');

    const generatedCSS = \`:root {
  --hx-color-primary-500: \${args.primary500};
  --hx-color-primary-600: \${args.primary600};
  --hx-color-primary-700: \${args.primary700};
  --hx-color-error-500:   \${args.error500};
  --hx-border-radius-md:  \${args.radiusMd}px;
  --hx-border-radius-lg:  \${args.radiusLg}px;
  --hx-space-4:           \${args.space4}px;
  --hx-font-size-md:      \${args.fontSizeMd}px;
}\`;

    return html\`
      <div
        style="\${styleString}; display: grid; gap: var(--hx-space-6, 24px); padding: var(--hx-space-6, 24px); background: var(--hx-color-surface-default); color: var(--hx-color-text-primary);"
      >
        <section>
          <h3
            style="margin: 0 0 var(--hx-space-3, 12px); font-size: 14px; font-weight: 600; font-family: var(--hx-font-family-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--hx-color-text-muted);"
          >
            Buttons
          </h3>
          <div style="display: flex; gap: var(--hx-space-3, 12px); flex-wrap: wrap;">
            <${ds}-button variant="primary">Create project</${ds}-button>
            <${ds}-button variant="secondary">Cancel</${ds}-button>
            <${ds}-button variant="ghost">Skip</${ds}-button>
            <${ds}-button variant="danger">Delete workspace</${ds}-button>
          </div>
        </section>

        <section>
          <h3
            style="margin: 0 0 var(--hx-space-3, 12px); font-size: 14px; font-weight: 600; font-family: var(--hx-font-family-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--hx-color-text-muted);"
          >
            Form + chips
          </h3>
          <div
            style="display: flex; gap: var(--hx-space-3, 12px); align-items: center; flex-wrap: wrap;"
          >
            <hx-text-input value="acct-849172" placeholder="Account ID"></hx-text-input>
            <hx-tag>Engineering</hx-tag>
            <hx-tag>Editor</hx-tag>
            <hx-tag>EU region</hx-tag>
          </div>
        </section>

        <section>
          <h3
            style="margin: 0 0 var(--hx-space-3, 12px); font-size: 14px; font-weight: 600; font-family: var(--hx-font-family-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--hx-color-text-muted);"
          >
            Card + alert
          </h3>
          <div
            style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--hx-space-4, 16px); align-items: start;"
          >
            <hx-card>
              <div slot="heading" style="font-weight: 600;">Jordan Reyes</div>
              <div style="font-size: 13px; color: var(--hx-color-text-secondary);">
                acct-849172 · Editor · Engineering team
              </div>
              <${ds}-button slot="footer" variant="primary" hx-size="sm">Open profile</${ds}-button>
            </hx-card>
            <hx-alert variant="info" open>
              <strong slot="title">Two projects merged</strong>
              Reviewed by an admin · undo within 30s
            </hx-alert>
          </div>
        </section>

        <section>
          <h3
            style="margin: 0 0 var(--hx-space-3, 12px); font-size: 14px; font-weight: 600; font-family: var(--hx-font-family-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--hx-color-text-muted);"
          >
            Generated CSS
          </h3>
          <pre
            style="margin: 0; background: var(--hx-color-surface-sunken); border: 1px solid var(--hx-color-border-subtle); border-radius: var(--hx-border-radius-md, 6px); padding: var(--hx-space-4, 16px); font-family: var(--hx-font-family-mono); font-size: 12px; line-height: 1.6; color: var(--hx-color-text-strong); overflow-x: auto;"
          >
\${generatedCSS}</pre
          >
        </section>
      </div>
    \`;
  },
} satisfies Meta<PlaygroundArgs>;

export default meta;
type Story = StoryObj<PlaygroundArgs>;

/**
 * Default playground — start here. Tweak the controls panel on the
 * right to override the helix tokens and watch every component reflow.
 */
export const Default: Story = {};

/**
 * Sharp / dense — minimum radius, smaller spacing, denser type.
 * Showcases how the same components feel when the consumer dials shape
 * and spacing down to the tightest end of the scale (data-heavy admin
 * UIs, dev tools).
 */
export const SharpDense: Story = {
  args: {
    radiusSm: '0',
    radiusMd: '0',
    radiusLg: '2',
    space2: '4',
    space3: '6',
    space4: '8',
    space6: '12',
    fontSizeMd: '14',
  },
};

/**
 * Soft / spacious — maximum radius, generous spacing. The consumer-
 * facing end of the scale: marketing pages, onboarding flows, public
 * portals.
 */
export const SoftSpacious: Story = {
  args: {
    radiusSm: '12',
    radiusMd: '16',
    radiusLg: '24',
    space2: '12',
    space3: '20',
    space4: '28',
    space6: '40',
    fontSizeMd: '17',
  },
};

/**
 * Brand · Meridian — indigo primary tint. Demonstrates the white-label
 * cascade: changing only the primary stops shifts the entire system.
 */
export const BrandMeridian: Story = {
  args: {
    primary500: '#5B8AFF',
    primary600: '#003DA5',
    primary700: '#002D8A',
  },
};

/**
 * Brand · Lumen — violet primary tint. Same components, different brand.
 */
export const BrandLumen: Story = {
  args: {
    primary500: '#C084FC',
    primary600: '#7C3AED',
    primary700: '#6D28D9',
  },
};

// ifDefined imported for completeness — Lit pattern when arg-driven
// attrs can be undefined; suppresses the unused-import lint without
// changing runtime behavior.
void ifDefined;
`,
  };
}
