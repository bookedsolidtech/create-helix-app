---
'create-helix': minor
---

`wc-storybook` factory — port helix's MDX editorial depth + React helpers
so a freshly scaffolded design system reaches ~277 sidebar entries on
first boot (up from ~242).

**New per-component conformance MDXes (`src/stories/components/`).** Seven
new pages — `{ds}-card`, `{ds}-checkbox`, `{ds}-dialog`, `{ds}-form`,
`{ds}-select`, `{ds}-tabs`, `{ds}-text-input` — parameterized by `dsName`
and `tokenPrefix` so the consumer's namespace lands everywhere (e.g.
`<aurora-card>` / `AuroraCard`). Each page composes the auto-injected
A11yStatusCard, APGPatternCard, and ConsumerObligations panels.

**New `Accessibility/*` namespace (`src/stories/accessibility/`).** Eight
narrative pages: Dashboard, AAA Story Template, Keyboard Contracts,
Success Criteria, Consumer Obligations, Focus Management, Contrast Deep
Dive, Forced Colors, plus a `_snippets.ts` constants module. Positioned
between Foundations and Patterns in `storySort`.

**New scenes + token deep-dives.** Four cross-domain-neutral scene
stories — `account-setup`, `team-dashboard`, `settings`, `Tokens`
playground — and two token MDXes (Borders, Shadows). All scene content
is generic SaaS/team-tool shaped (no domain-locked sample data).

**Seven new React helper components (`src/stories/_components/`).**
TokenSwatchGrid, ContrastMatrix, RatioCard, CodeBlock, CodeTabs,
useResolvedToken, contrast (APCA util), plus TokenRef transitively.
Shiki is added as a `devDependency` for syntax highlighting; consumers
can opt out by deleting the component if they don't want the bundle
weight.

**InlineAuditPanel now opt-in.** The component renders nothing by default;
consumers pass a `markdown` prop to surface AAA audit content. Replaces
the prior live emission whose `?raw` AAA-AUDIT.md sourcing depended on
monorepo-internal paths that don't survive a fresh scaffold install.

**`Foundations/Tokens/*` taxonomy nested.** `storySort` now distinguishes
`Foundations/<topic>.mdx` (Color, Typography, Spacing, Layout, Brand,
Accessibility) from `Foundations/Tokens/<topic>.mdx` (Borders, Shadows,
Playground) plus the existing token swatch stories.

**Fix:** the wc-storybook scaffold's `tokens.json` fallback copy was
bypassing the dry-run guard; routed through `safeCopyFile` so
`scaffold({ dryRun: true })` no longer writes to disk.

**Follow-up tracked at `docs/FOLLOW-UP-shared-storybook-kit.md`:** the
deferred `@helixui/storybook-kit` shared-package extraction that would
replace this hand-mirrored port pattern across helix/apps/storybook and
create-helix-app. Trigger conditions documented.

CI test matrix dropped Node 20 (Node 22 + 24 only); standalone jobs and
`engines` keep their existing pins.
