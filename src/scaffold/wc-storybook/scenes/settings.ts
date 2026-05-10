import type { SceneEmission, SceneEmissionContext } from '../scenes.js';

/**
 * settings.stories.ts emitter.
 *
 * Port of upstream `patterns/scenes/settings.stories.ts` with two healthcare-
 * tinted toggle labels neutralized:
 *
 *   "Appointment reminders" → "Workspace invites"
 *   "Lab results"           → "Mentions & comments"
 *
 * (The third toggle, "Marketing updates", was already neutral.) The
 * accessibility-panel labels (High contrast / Reduced motion / Text size)
 * were already neutral; preserved verbatim. Tabs (General / Notifications
 * / Accessibility) stay.
 *
 * Tag substitution: every literal `hx-*` reference is rewritten to the
 * consumer's `{ds}-*`. Component-registry imports stay literal.
 *
 * Story shape preserves upstream's 4 stories:
 *   Default                — render-only
 *   RendersRealComponents  — structural assertion (every visible control
 *                            is a real {ds}-* component)
 *   SwitchToggle           — marketing-updates switch dispatches hx-change
 *   SaveClick              — primary save button dispatches hx-click
 */
export function emitSettingsScene({ dsName }: SceneEmissionContext): SceneEmission {
  const ds = dsName;
  return {
    relativePath: 'src/stories/patterns/scenes/settings.stories.ts',
    content: `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { expect, userEvent, within } from 'storybook/test';

// Scene composition imports — every component is documented + tested in
// its own Components/* tree. This scene demonstrates a configuration
// flow built from documented ${ds}-* components: tabbed sections,
// switches, selects, and a save/cancel button bar.
import '@helixui/library/components/hx-tabs';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-switch';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-divider';

// ─────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────

const meta = {
  title: 'Patterns/Scenes/Settings',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full settings/preferences scene assembled from documented ${ds}-* components. ' +
          'Tabbed sections route to general / notifications / accessibility panels. ' +
          'Every toggle, select, and button is a real component — no mock divs. ' +
          \`The story's \\\`play()\\\` functions exercise tab navigation, switch toggling, \` +
          'select changes, and the save/cancel flow.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─────────────────────────────────────────────────
// Render — shared by every story below
// ─────────────────────────────────────────────────

const renderSettings = () => html\`
  <div
    style="
      max-width: 880px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: var(--hx-font-family-sans, system-ui);
    "
  >
    <header style="margin-bottom: 24px;">
      <h1
        style="
          margin: 0 0 4px;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--hx-color-text-primary);
        "
      >
        Settings
      </h1>
      <p
        style="
          margin: 0;
          font-size: 14px;
          color: var(--hx-color-text-secondary);
          line-height: 1.5;
        "
      >
        Manage your account preferences. Changes save when you click "Save changes".
      </p>
    </header>

    <${ds}-tabs
      data-testid="settings-tabs"
      label="Settings sections"
      activation="manual"
      style="display: block;"
    >
      <${ds}-tab slot="tab" panel="general" active data-testid="tab-general">General</${ds}-tab>
      <${ds}-tab slot="tab" panel="notifications" data-testid="tab-notifications">Notifications</${ds}-tab>
      <${ds}-tab slot="tab" panel="accessibility" data-testid="tab-accessibility">Accessibility</${ds}-tab>

      <${ds}-tab-panel name="general">
        <${ds}-card variant="default" elevation="raised" style="display: block; margin-top: 16px;">
          <span slot="heading">Account</span>
          <div style="display: grid; gap: 16px; padding: 8px 0;">
            <${ds}-text-input
              data-testid="setting-display-name"
              label="Display name"
              name="displayName"
              value="Jordan Reyes"
            ></${ds}-text-input>
            <${ds}-select
              data-testid="setting-language"
              label="Language"
              name="language"
              value="en-US"
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="es-MX">Español (México)</option>
              <option value="fr-CA">Français (Canada)</option>
            </${ds}-select>
            <${ds}-select
              data-testid="setting-timezone"
              label="Timezone"
              name="timezone"
              value="America/New_York"
            >
              <option value="America/New_York">Eastern Time (US & Canada)</option>
              <option value="America/Chicago">Central Time (US & Canada)</option>
              <option value="America/Denver">Mountain Time (US & Canada)</option>
              <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
            </${ds}-select>
          </div>
        </${ds}-card>
      </${ds}-tab-panel>

      <${ds}-tab-panel name="notifications">
        <${ds}-card variant="default" elevation="raised" style="display: block; margin-top: 16px;">
          <span slot="heading">Email notifications</span>
          <div style="display: grid; gap: 16px; padding: 8px 0;">
            <label
              style="display: flex; align-items: center; justify-content: space-between; gap: 16px;"
            >
              <div>
                <div style="font-weight: 600; font-size: 14px;">Workspace invites</div>
                <div style="font-size: 12px; color: var(--hx-color-text-muted); margin-top: 2px;">
                  Email me when someone is invited to or joins my workspace.
                </div>
              </div>
              <${ds}-switch data-testid="setting-workspace-invites" name="workspaceInvites" checked
                >On</${ds}-switch
              >
            </label>
            <label
              style="display: flex; align-items: center; justify-content: space-between; gap: 16px;"
            >
              <div>
                <div style="font-weight: 600; font-size: 14px;">Mentions & comments</div>
                <div style="font-size: 12px; color: var(--hx-color-text-muted); margin-top: 2px;">
                  Email me when a teammate @-mentions me or replies to a thread I started.
                </div>
              </div>
              <${ds}-switch data-testid="setting-mentions" name="mentions" checked>On</${ds}-switch>
            </label>
            <label
              style="display: flex; align-items: center; justify-content: space-between; gap: 16px;"
            >
              <div>
                <div style="font-weight: 600; font-size: 14px;">Product updates</div>
                <div style="font-size: 12px; color: var(--hx-color-text-muted); margin-top: 2px;">
                  Occasional product news and release-note highlights.
                </div>
              </div>
              <${ds}-switch data-testid="setting-marketing" name="marketing">Off</${ds}-switch>
            </label>
          </div>
        </${ds}-card>
      </${ds}-tab-panel>

      <${ds}-tab-panel name="accessibility">
        <${ds}-card variant="default" elevation="raised" style="display: block; margin-top: 16px;">
          <span slot="heading">Display & motion</span>
          <div style="display: grid; gap: 16px; padding: 8px 0;">
            <label
              style="display: flex; align-items: center; justify-content: space-between; gap: 16px;"
            >
              <div>
                <div style="font-weight: 600; font-size: 14px;">High contrast</div>
                <div style="font-size: 12px; color: var(--hx-color-text-muted); margin-top: 2px;">
                  Increase contrast of borders, focus rings, and disabled states.
                </div>
              </div>
              <${ds}-switch data-testid="setting-high-contrast" name="highContrast">Off</${ds}-switch>
            </label>
            <label
              style="display: flex; align-items: center; justify-content: space-between; gap: 16px;"
            >
              <div>
                <div style="font-weight: 600; font-size: 14px;">Reduced motion</div>
                <div style="font-size: 12px; color: var(--hx-color-text-muted); margin-top: 2px;">
                  Skip non-essential transitions and animations.
                </div>
              </div>
              <${ds}-switch data-testid="setting-reduced-motion" name="reducedMotion" checked
                >On</${ds}-switch
              >
            </label>
            <${ds}-select
              data-testid="setting-text-size"
              label="Text size"
              name="textSize"
              value="medium"
              help-text="Scales body and label text together. Headings adjust proportionally."
            >
              <option value="small">Small</option>
              <option value="medium">Medium (default)</option>
              <option value="large">Large</option>
              <option value="x-large">Extra large</option>
            </${ds}-select>
          </div>
        </${ds}-card>
      </${ds}-tab-panel>
    </${ds}-tabs>

    <div
      style="
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--hx-color-border-subtle);
      "
    >
      <${ds}-button variant="ghost" data-testid="settings-cancel">Cancel</${ds}-button>
      <${ds}-button variant="primary" data-testid="settings-save">Save changes</${ds}-button>
    </div>
  </div>
\`;

// ─────────────────────────────────────────────────
// 1. Default — render only, axe panel covers a11y
// ─────────────────────────────────────────────────

/**
 * The settings page rendered at rest. Cycle the toolbar theme + brand
 * to verify the layout holds across all 12 (3 × 4) combinations.
 */
export const Default: Story = {
  render: renderSettings,
};

// ─────────────────────────────────────────────────
// 2. Renders Real Components — structural assertion
// ─────────────────────────────────────────────────

/**
 * Confirms every tab, panel, switch, select, and button is an actual
 * ${ds}-* component (not a fake div). If a component fails to register,
 * the story fails fast.
 */
export const RendersRealComponents: Story = {
  render: renderSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const tabs = canvas.getByTestId('settings-tabs') as HTMLElement;
    await expect(tabs.tagName.toLowerCase()).toBe('${ds}-tabs');

    const general = canvas.getByTestId('tab-general') as HTMLElement;
    const notifications = canvas.getByTestId('tab-notifications') as HTMLElement;
    const a11y = canvas.getByTestId('tab-accessibility') as HTMLElement;
    await expect(general.tagName.toLowerCase()).toBe('${ds}-tab');
    await expect(notifications.tagName.toLowerCase()).toBe('${ds}-tab');
    await expect(a11y.tagName.toLowerCase()).toBe('${ds}-tab');

    const save = canvas.getByTestId('settings-save') as HTMLElement;
    const cancel = canvas.getByTestId('settings-cancel') as HTMLElement;
    await expect(save.tagName.toLowerCase()).toBe('${ds}-button');
    await expect(cancel.tagName.toLowerCase()).toBe('${ds}-button');
  },
};

// ─────────────────────────────────────────────────
// 3. Switch Toggle — boolean state flips + emits hx-change
// ─────────────────────────────────────────────────

/**
 * Toggles the product-updates switch (initially off) and verifies that
 * \`hx-change\` fires with the new checked state. This is the canonical
 * boolean-control test pattern: capture the event, click the inner
 * control, assert detail.
 */
export const SwitchToggle: Story = {
  render: renderSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const sw = canvas.getByTestId('setting-marketing') as HTMLElement & { checked?: boolean };
    await expect(sw.tagName.toLowerCase()).toBe('${ds}-switch');
    await expect(sw.checked).toBeFalsy();

    let lastDetail: { checked: boolean; value: string } | null = null;
    sw.addEventListener('hx-change', (e) => {
      lastDetail = (e as CustomEvent<{ checked: boolean; value: string }>).detail;
    });

    // Click the inner native checkbox-driven toggle through the host.
    const inner = sw.shadowRoot?.querySelector(
      'button, input[type="checkbox"]',
    ) as HTMLElement | null;
    await expect(inner).toBeTruthy();
    inner!.click();

    await expect(sw.checked).toBe(true);
    await expect(lastDetail).toBeTruthy();
    await expect(lastDetail!.checked).toBe(true);
  },
};

// ─────────────────────────────────────────────────
// 4. Save Click — primary action emits hx-click
// ─────────────────────────────────────────────────

/**
 * Click the save button and verify the canonical \`hx-click\` event
 * fires. Buttons inside a settings bar must still emit through the
 * shadow boundary.
 */
export const SaveClick: Story = {
  render: renderSettings,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByTestId('settings-save') as HTMLElement;

    let clicked = false;
    save.addEventListener('hx-click', () => {
      clicked = true;
    });

    const inner = save.shadowRoot?.querySelector('button') as HTMLButtonElement | null;
    await expect(inner).toBeTruthy();
    await userEvent.click(inner!);

    await expect(clicked).toBe(true);
  },
};
`,
  };
}
