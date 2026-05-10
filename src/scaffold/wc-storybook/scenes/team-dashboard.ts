import type { SceneEmission, SceneEmissionContext } from '../scenes.js';

/**
 * team-dashboard.stories.ts emitter.
 *
 * Full rewrite of upstream `provider-dashboard.stories.ts` as a generic
 * team-admin overview:
 *
 *   - Header: workspace name + role descriptor, "Export roster" + "+
 *     Invite member" buttons.
 *   - Stat row (4-up): Active members / Pending invites / Last activity
 *     / Open tasks.
 *   - Card #1: Recent activity table (member, action, time, status).
 *   - Card row #2: Awaiting-review action cards (3 of them) — each with
 *     a context paragraph + secondary action button.
 *
 * Story shape preserves upstream's 3 stories:
 *   Default                — render-only
 *   RendersRealComponents  — structural assertion that every visible
 *                            control is a real {ds}-* component.
 *   ActionCardClick        — embedded button dispatches hx-click
 *
 * Tag substitution: every literal `hx-*` reference is rewritten to the
 * consumer's `{ds}-*`. Component-registry imports under
 * `@helixui/library/components/hx-*` stay literal.
 *
 * Forbidden strings (enforced by Phase 4 grep tests): no patient/MRN/
 * clinic/provider/chart/appointment/prescription/medication anywhere.
 */
export function emitTeamDashboardScene({ dsName }: SceneEmissionContext): SceneEmission {
  const ds = dsName;
  return {
    relativePath: 'src/stories/patterns/scenes/team-dashboard.stories.ts',
    content: `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { expect, userEvent, within } from 'storybook/test';

// Scene composition imports — every component is documented + tested in
// its own Components/* tree. This story exercises layout density: stat
// tiles, a data table, and a card grid for a team-admin overview page.
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-stat';
import '@helixui/library/components/hx-data-table';
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-avatar';

// ─────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────

const meta = {
  title: 'Patterns/Scenes/Team Dashboard',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Team-admin dashboard composed from documented ${ds}-* components. ' +
          'Demonstrates layout density: 4-up stat tiles, a sortable recent ' +
          'activity table, and a card grid for items awaiting review. Every ' +
          'visible control is a real component — no mock divs.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─────────────────────────────────────────────────
// Sample data — generic team-admin shape
// ─────────────────────────────────────────────────

const ACTIVITY_COLUMNS = [
  { key: 'member', label: 'Member', sortable: true },
  { key: 'action', label: 'Action', sortable: true },
  { key: 'project', label: 'Project', sortable: true },
  { key: 'time', label: 'Time', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
];

const ACTIVITY_ROWS = [
  {
    member: 'Jordan Reyes',
    action: 'Submitted PR',
    project: 'Workspace settings',
    time: '8:30 AM',
    status: 'Awaiting review',
  },
  {
    member: 'Sam Patel',
    action: 'Closed issue',
    project: 'Onboarding flow',
    time: '9:00 AM',
    status: 'Done',
  },
  {
    member: 'Avery Chen',
    action: 'Created project',
    project: 'Quarterly planning',
    time: '9:30 AM',
    status: 'New',
  },
  {
    member: 'Riley Okafor',
    action: 'Posted comment',
    project: 'Workspace settings',
    time: '10:00 AM',
    status: 'Open',
  },
  {
    member: 'Casey Nguyen',
    action: 'Updated docs',
    project: 'Onboarding flow',
    time: '10:30 AM',
    status: 'Open',
  },
];

// ─────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────

const renderDashboard = () => html\`
  <div
    style="
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
      font-family: var(--hx-font-family-sans, system-ui);
    "
  >
    <header
      style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      "
    >
      <div>
        <h1
          style="
            margin: 0 0 4px;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--hx-color-text-primary);
          "
        >
          Acme · Today
        </h1>
        <p
          style="
            margin: 0;
            font-size: 13px;
            color: var(--hx-color-text-secondary);
            font-family: var(--hx-font-family-mono);
          "
        >
          Workspace admin · 24 members · 3 projects
        </p>
      </div>
      <div style="display: flex; gap: 8px;">
        <${ds}-button variant="ghost" hx-size="sm" data-testid="dashboard-export"
          >Export roster</${ds}-button
        >
        <${ds}-button variant="primary" hx-size="sm" data-testid="dashboard-invite"
          >+ Invite member</${ds}-button
        >
      </div>
    </header>

    <div
      data-testid="dashboard-stats"
      style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      "
    >
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <div style="padding: 16px;">
          <${ds}-stat label="Active members" value="24" trend="up"></${ds}-stat>
        </div>
      </${ds}-card>
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <div style="padding: 16px;">
          <${ds}-stat label="Pending invites" value="3" trend="down"></${ds}-stat>
        </div>
      </${ds}-card>
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <div style="padding: 16px;">
          <${ds}-stat label="Last activity" value="8m ago" trend="neutral"></${ds}-stat>
        </div>
      </${ds}-card>
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <div style="padding: 16px;">
          <${ds}-stat label="Open tasks" value="6" trend="up"></${ds}-stat>
        </div>
      </${ds}-card>
    </div>

    <${ds}-card variant="default" elevation="raised" style="display: block;">
      <span slot="heading">Recent activity</span>
      <div style="padding: 4px 0;">
        <${ds}-data-table
          data-testid="dashboard-activity"
          label="Recent member activity"
          .columns=\${ACTIVITY_COLUMNS}
          .rows=\${ACTIVITY_ROWS}
          sort-key="time"
          sort-direction="asc"
        ></${ds}-data-table>
      </div>
    </${ds}-card>

    <h2
      style="
        margin: 24px 0 12px;
        font-size: 14px;
        font-family: var(--hx-font-family-mono);
        color: var(--hx-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
      "
    >
      Awaiting your review
    </h2>
    <div
      data-testid="dashboard-cards"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;"
    >
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <span slot="heading">Pull request · Workspace settings</span>
        <div style="padding: 12px 0; font-size: 13px; line-height: 1.5;">
          <p style="margin: 0 0 8px; color: var(--hx-color-text-secondary);">
            Jordan Reyes opened a PR yesterday at 4:12 PM. 8 files changed, awaiting your sign-off.
          </p>
          <${ds}-button variant="secondary" hx-size="sm" data-testid="card-action-1"
            >Review</${ds}-button
          >
        </div>
      </${ds}-card>
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <span slot="heading">Invite · Riley Okafor</span>
        <div style="padding: 12px 0; font-size: 13px; line-height: 1.5;">
          <p style="margin: 0 0 8px; color: var(--hx-color-text-secondary);">
            Pending invite as Editor on the Onboarding flow project. Sent 2 days ago.
          </p>
          <${ds}-button variant="secondary" hx-size="sm" data-testid="card-action-2"
            >Resend</${ds}-button
          >
        </div>
      </${ds}-card>
      <${ds}-card variant="default" elevation="flat" style="display: block;">
        <span slot="heading">Billing · Seat upgrade</span>
        <div style="padding: 12px 0; font-size: 13px; line-height: 1.5;">
          <p style="margin: 0 0 8px; color: var(--hx-color-text-secondary);">
            Your team is approaching the 25-seat plan limit. Upgrade to keep adding members.
          </p>
          <${ds}-button variant="secondary" hx-size="sm" data-testid="card-action-3"
            >Upgrade</${ds}-button
          >
        </div>
      </${ds}-card>
    </div>
  </div>
\`;

// ─────────────────────────────────────────────────
// 1. Default — visual + axe panel
// ─────────────────────────────────────────────────

/**
 * The dashboard rendered with no interaction. Cycle the toolbar theme +
 * brand to verify the layout holds across all 12 (3 × 4) combinations.
 */
export const Default: Story = {
  render: renderDashboard,
};

// ─────────────────────────────────────────────────
// 2. Renders Real Components — structural assertion
// ─────────────────────────────────────────────────

/**
 * Confirms every header, stat tile, table, and action card is an actual
 * ${ds}-* component (not a fake div). If a component fails to register,
 * the story fails fast.
 */
export const RendersRealComponents: Story = {
  render: renderDashboard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Stat tiles — 4 of them
    const statsRow = canvas.getByTestId('dashboard-stats');
    const stats = statsRow.querySelectorAll('${ds}-stat');
    await expect(stats.length).toBe(4);

    // Recent activity table
    const activity = canvas.getByTestId('dashboard-activity') as HTMLElement;
    await expect(activity.tagName.toLowerCase()).toBe('${ds}-data-table');

    // Action cards — 3 of them
    const cardsRow = canvas.getByTestId('dashboard-cards');
    const cards = cardsRow.querySelectorAll('${ds}-card');
    await expect(cards.length).toBe(3);

    // Header buttons
    const exportBtn = canvas.getByTestId('dashboard-export');
    const invite = canvas.getByTestId('dashboard-invite');
    await expect(exportBtn.tagName.toLowerCase()).toBe('${ds}-button');
    await expect(invite.tagName.toLowerCase()).toBe('${ds}-button');
  },
};

// ─────────────────────────────────────────────────
// 3. Action Card Click — buttons inside cards still emit events
// ─────────────────────────────────────────────────

/**
 * Clicks one of the action card buttons. Verifies the embedded
 * ${ds}-button dispatches \\\`hx-click\\\` even when nested inside
 * ${ds}-card slots — a common regression target for shadow-boundary
 * event composition.
 */
export const ActionCardClick: Story = {
  render: renderDashboard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByTestId('card-action-1') as HTMLElement;
    await expect(action.tagName.toLowerCase()).toBe('${ds}-button');

    let clicked = false;
    action.addEventListener('hx-click', () => {
      clicked = true;
    });

    const inner = action.shadowRoot?.querySelector('button') as HTMLButtonElement | null;
    await expect(inner).toBeTruthy();
    await userEvent.click(inner!);

    await expect(clicked).toBe(true);
  },
};
`,
  };
}
