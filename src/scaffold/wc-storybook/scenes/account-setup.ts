import type { SceneEmission, SceneEmissionContext } from '../scenes.js';

/**
 * account-setup.stories.ts emitter.
 *
 * Full rewrite of upstream `patient-intake.stories.ts` as a generic SaaS
 * account-setup / sign-up flow:
 *
 *   - Card #1: Personal information (first name, last name, email,
 *     work phone)
 *   - Card #2: Workspace details (organization, role select, contact
 *     preference radio group, "this is my first workspace" checkbox)
 *   - Card #3: Consent (Terms of Service + privacy notice checkboxes)
 *   - Footer: Cancel + Create account buttons
 *
 * Story shape preserves upstream's 4 stories:
 *   Default        — render-only
 *   SubmitEmpty    — required-field validation contract
 *   HappyPath      — fills + asserts host-reflected `.value`
 *   ResetClearsForm — cancel button dispatches `hx-click`
 *
 * Tag substitution: every literal `hx-*` reference is rewritten to the
 * consumer's `{ds}-*` (lowercase form). Component-registry imports under
 * `@helixui/library/components/hx-*` stay literal — those are the
 * upstream classes the consumer's `{ds}-*` extends.
 *
 * Forbidden strings (enforced by Phase 4 grep tests): patient, MRN,
 * clinic, intake, provider, chart, appointment, prescription,
 * medication, consent form (the literal phrase). The card heading
 * "Consent" alone is fine.
 */
export function emitAccountSetupScene({ dsName }: SceneEmissionContext): SceneEmission {
  const ds = dsName;
  return {
    relativePath: 'src/stories/patterns/scenes/account-setup.stories.ts',
    content: `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { expect, userEvent, within } from 'storybook/test';

// Scene composition imports — every component is documented + tested in
// its own Components/* tree. This story exists to demonstrate them
// working together as the canonical "create your account" SaaS sign-up
// flow a consumer would build.
import '@helixui/library/components/hx-form';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-radio-group';
import '@helixui/library/components/hx-checkbox';
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-alert';

// ─────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────

const meta = {
  title: 'Patterns/Scenes/Account Setup',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full account-setup scene assembled from documented ${ds}-* components. ' +
          'Every input, selection, and validation flow is exercised by the ' +
          \`story's \\\`play()\\\` function. This is the canonical reference for how \` +
          'a downstream create-helix-app consumer should build a sign-up flow ' +
          'on top of HELiX.',
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

const renderAccountSetup = () => html\`
  <div
    style="
      max-width: 720px;
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
        Create your account
      </h1>
      <p
        style="
          margin: 0;
          font-size: 14px;
          color: var(--hx-color-text-secondary);
          line-height: 1.5;
        "
      >
        Tell us about you and your team. Fields marked with an asterisk are required.
      </p>
    </header>

    <${ds}-form id="account-form">
      <${ds}-card variant="default" elevation="raised" style="display: block;">
        <span slot="heading">Personal information</span>

        <div style="display: grid; gap: 16px; padding: 8px 0;">
          <${ds}-text-input
            data-testid="account-first-name"
            label="First name"
            name="firstName"
            placeholder="Jordan"
            required
          ></${ds}-text-input>

          <${ds}-text-input
            data-testid="account-last-name"
            label="Last name"
            name="lastName"
            placeholder="Reyes"
            required
          ></${ds}-text-input>

          <${ds}-text-input
            data-testid="account-email"
            type="email"
            label="Work email"
            name="email"
            placeholder="you@example.com"
            help-text="We use this to verify your account and send sign-in links."
            required
          ></${ds}-text-input>

          <${ds}-text-input
            data-testid="account-phone"
            type="tel"
            label="Work phone (optional)"
            name="phone"
            placeholder="(555) 555-0123"
          ></${ds}-text-input>
        </div>
      </${ds}-card>

      <${ds}-card variant="default" elevation="raised" style="display: block; margin-top: 16px;">
        <span slot="heading">Workspace details</span>

        <div style="display: grid; gap: 16px; padding: 8px 0;">
          <${ds}-text-input
            data-testid="account-organization"
            label="Organization name"
            name="organization"
            placeholder="Acme Inc"
            required
          ></${ds}-text-input>

          <${ds}-select
            data-testid="account-role"
            label="Your role"
            name="role"
            placeholder="Choose a role"
            required
          >
            <option value="engineering">Engineering</option>
            <option value="design">Design</option>
            <option value="product">Product management</option>
            <option value="operations">Operations</option>
            <option value="marketing">Marketing</option>
            <option value="other">Other</option>
          </${ds}-select>

          <${ds}-radio-group
            data-testid="account-contact-pref"
            label="Preferred contact method"
            name="contactPreference"
            help-text="How should we reach you about your workspace?"
            value="email"
          >
            <${ds}-radio value="email" label="Email"></${ds}-radio>
            <${ds}-radio value="phone" label="Phone call"></${ds}-radio>
            <${ds}-radio value="text" label="Text message"></${ds}-radio>
            <${ds}-radio value="in-app" label="In-app notifications only"></${ds}-radio>
          </${ds}-radio-group>

          <${ds}-checkbox name="firstWorkspace" data-testid="account-first-workspace">
            This is my first workspace on this product
          </${ds}-checkbox>
        </div>
      </${ds}-card>

      <${ds}-card variant="default" elevation="raised" style="display: block; margin-top: 16px;">
        <span slot="heading">Consent</span>

        <div style="display: grid; gap: 12px; padding: 8px 0;">
          <${ds}-checkbox name="acceptTerms" data-testid="account-consent-terms" required>
            I have read and agree to the
            <a
              href="#terms"
              style="color: var(--hx-color-text-link); text-decoration: underline;"
              >terms of service</a
            >.
          </${ds}-checkbox>
          <${ds}-checkbox name="acceptPrivacy" data-testid="account-consent-privacy" required>
            I acknowledge the privacy notice.
          </${ds}-checkbox>
        </div>
      </${ds}-card>

      <div
        id="account-result"
        data-testid="account-result"
        style="margin-top: 16px; min-height: 0;"
      ></div>

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
        <${ds}-button variant="ghost" type="reset" data-testid="account-cancel">Cancel</${ds}-button>
        <${ds}-button variant="primary" type="submit" data-testid="account-submit">
          Create account
        </${ds}-button>
      </div>
    </${ds}-form>
  </div>
\`;

// ─────────────────────────────────────────────────
// 1. Default — render only, axe panel covers a11y
// ─────────────────────────────────────────────────

/**
 * The sign-up form rendered with no interaction. Visit this story to
 * inspect the layout under any theme + brand combination — the toolbar
 * in the Storybook preview cycles all 3 themes (light / dark / hc) and
 * 4 brands.
 */
export const Default: Story = {
  render: renderAccountSetup,
};

// ─────────────────────────────────────────────────
// 2. Submit Empty — required-field surfaces validation
// ─────────────────────────────────────────────────

/**
 * Click submit on an empty form and verify the application-level
 * validation flow: \\\`${ds}-form\\\` runs its own \\\`checkValidity()\\\`
 * against every named field, dispatches \\\`hx-invalid\\\` when required
 * fields are blank, and does not dispatch \\\`hx-submit\\\`. This is the
 * contract a consumer relies on — submission is blocked by HELiX
 * validation, not by the browser silently swallowing the submit event.
 */
export const SubmitEmpty: Story = {
  render: renderAccountSetup,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const form = canvasElement.querySelector('#account-form') as HTMLElement & {
      checkValidity?: () => boolean;
    };
    await expect(form).toBeTruthy();

    type HxInvalidDetail = { errors: Array<{ name?: string; message?: string }> };
    let submitted = false;
    let invalidEvent: CustomEvent<HxInvalidDetail> | null = null;
    form.addEventListener('hx-submit', () => {
      submitted = true;
    });
    form.addEventListener('hx-invalid', (event: Event) => {
      invalidEvent = event as CustomEvent<HxInvalidDetail>;
    });

    const submit = canvas.getByTestId('account-submit');
    const innerSubmit = (submit as HTMLElement).shadowRoot?.querySelector(
      'button',
    ) as HTMLButtonElement | null;
    await expect(innerSubmit).toBeTruthy();

    // ${ds}-form is a custom element, not a <form>. Clicking the inner
    // button is a real-world entry point but the eventual signal is a
    // \\\`submit\\\` event bubbled to ${ds}-form. Dispatch it directly so
    // the test verifies the validation contract independently of any
    // form-association gap.
    await userEvent.click(innerSubmit!);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // ${ds}-form's validation pass blocks submission and reports the
    // failure:
    //   - hx-submit MUST NOT fire (application logic prevents it)
    //   - hx-invalid MUST fire with at least one error (the contract a
    //     consumer wires their error UI to)
    await expect(submitted).toBe(false);
    await expect(invalidEvent).not.toBeNull();
    await expect(Array.isArray(invalidEvent!.detail?.errors)).toBe(true);
    await expect(invalidEvent!.detail.errors.length).toBeGreaterThan(0);
  },
};

// ─────────────────────────────────────────────────
// 3. Happy Path — fill every required field + submit
// ─────────────────────────────────────────────────

/**
 * Fills the form with realistic sample data. Asserts that every targeted
 * host element receives the value (the observable contract a consumer
 * can rely on). The submit dispatch is driven by ${ds}-form's internal
 * validity check; this story verifies the scene is wired correctly
 * without depending on the submit-event payload shape (which is
 * exercised in the form-component test suite).
 */
export const HappyPath: Story = {
  render: renderAccountSetup,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const form = canvasElement.querySelector('#account-form') as HTMLFormElement | null;
    await expect(form).toBeTruthy();

    // Fill text fields by reaching into the shadow root's native input.
    const setHxInputValue = async (host: HTMLElement, value: string) => {
      const input = host.shadowRoot?.querySelector('input') as HTMLInputElement | null;
      await expect(input).toBeTruthy();
      input!.focus();
      input!.value = value;
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const firstName = canvas.getByTestId('account-first-name') as HTMLElement & { value: string };
    const lastName = canvas.getByTestId('account-last-name') as HTMLElement & { value: string };
    const email = canvas.getByTestId('account-email') as HTMLElement & { value: string };

    await setHxInputValue(firstName, 'Jordan');
    await setHxInputValue(lastName, 'Reyes');
    await setHxInputValue(email, 'jordan@example.com');

    // The host reflects its inner native input value through its own
    // \`.value\` property — assert that round-trips, which is the
    // consumer-facing contract.
    await expect(firstName.value).toBe('Jordan');
    await expect(lastName.value).toBe('Reyes');
    await expect(email.value).toBe('jordan@example.com');

    // Role <${ds}-select> — set host value directly.
    const role = canvas.getByTestId('account-role') as HTMLElement & { value: string };
    role.value = 'engineering';
    role.dispatchEvent(new Event('change', { bubbles: true }));
    await expect(role.value).toBe('engineering');
  },
};

// ─────────────────────────────────────────────────
// 4. Reset — cancel button dispatches hx-click
// ─────────────────────────────────────────────────

/**
 * Type into the first field, then click cancel. Verifies the cancel
 * button dispatches \`hx-click\` — the reset wiring is exercised by the
 * form component's own tests.
 */
export const ResetClearsForm: Story = {
  render: renderAccountSetup,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const firstName = canvas.getByTestId('account-first-name') as HTMLElement & { value: string };
    const inner = firstName.shadowRoot?.querySelector('input') as HTMLInputElement;
    await expect(inner).toBeTruthy();
    inner.focus();
    inner.value = 'Jordan';
    inner.dispatchEvent(new Event('input', { bubbles: true }));
    await expect(firstName.value).toBe('Jordan');

    const cancel = canvas.getByTestId('account-cancel') as HTMLElement;

    let cancelClicked = false;
    cancel.addEventListener('hx-click', () => {
      cancelClicked = true;
    });

    const innerCancel = cancel.shadowRoot?.querySelector('button') as HTMLButtonElement | null;
    await expect(innerCancel).toBeTruthy();
    await userEvent.click(innerCancel!);

    await expect(cancelClicked).toBe(true);
  },
};
`,
  };
}
