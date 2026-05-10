/**
 * wc-storybook audit-panel emitter.
 *
 * Replaces the previous live `InlineAuditPanel` emission in scaffold.ts.
 * Upstream Helix imports an AAA-AUDIT.md per component via Vite's `?raw`
 * suffix from `packages/hx-library/` — that path is monorepo-internal and
 * doesn't survive a fresh-scaffold install. We ship a no-op stub instead;
 * consumers wire their own audit content if and when they want one.
 *
 * Refs: shimmying-roaming-kernighan plan, Phase 1.
 */

export function inlineAuditPanelStubSrc(): string {
  return `/**
 * InlineAuditPanel — opt-in stub.
 *
 * Upstream Helix's storybook reads an AAA-AUDIT.md file per component
 * via a Vite raw-text import from a monorepo-internal path. That path
 * doesn't survive a fresh-scaffold install, so we ship a no-op stub
 * here. The component renders nothing by default.
 *
 * To wire your own audit content:
 *
 *   1. Author an AAA audit document (markdown) per component.
 *   2. Replace this stub with a renderer that reads your audit file and
 *      surfaces it inside the component's MDX docs page.
 *
 * Future direction: the shared \`@helixui/storybook-kit\` package (deferred,
 * see docs/FOLLOW-UP-shared-storybook-kit.md) is expected to ship a
 * runtime audit loader; this stub will be replaced at that point.
 */
import * as React from 'react';

export interface InlineAuditPanelProps {
  /** Component tag (display only). */
  tag: string;
  /** Optional opt-in markdown — when omitted, the panel renders nothing. */
  markdown?: string;
  /** Heading override. */
  heading?: string;
  /** When true, the panel renders open by default. */
  defaultOpen?: boolean;
}

export function InlineAuditPanel({
  tag,
  markdown,
  heading = 'Full AAA audit (inline)',
  defaultOpen = false,
}: InlineAuditPanelProps): React.ReactElement | null {
  if (!markdown) return null;
  return (
    <section className="hx-docs hx-inline-audit" aria-label={\`Inline AAA audit for \${tag}\`}>
      <details className="hx-inline-audit-details" open={defaultOpen}>
        <summary className="hx-inline-audit-summary">
          <span className="hx-inline-audit-icon" aria-hidden="true">
            📄
          </span>
          <span className="hx-inline-audit-heading">{heading}</span>
        </summary>
        <div className="hx-inline-audit-body">
          <pre className="hx-inline-audit-pre">
            <code>{markdown}</code>
          </pre>
        </div>
      </details>
    </section>
  );
}
`;
}
