---
id: HX-019
title: Storybook tests OOM around file 70 — uncleaned web-component listeners + DOM accumulation
status: filed
category: build-release
severity: high
reported: 2026-05-05T22:30:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: []
---

# HX-019 — Storybook test runner crashes deterministically at file 70

## Summary

Helix's Storybook test runner crashes with an out-of-memory abort
deterministically around the 70th `*.stories.ts` file when the full
suite is run. The root cause is cumulative Chromium heap exhaustion
from web-component instances that:

1. Register global event listeners (custom-event listeners on `window`,
   `MutationObserver`s) without an owning lifecycle that tears them
   down between stories.
2. Accumulate detached DOM subtrees because Storybook's iframe doesn't
   call `disconnectedCallback` between stories — the previous story's
   nodes remain GC-unreachable behind closures held by listeners that
   were never removed.

In CI, the Vitest-on-Storybook runner times out after the OOM and the
watchdog force-kills it 40+ minutes in.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `pnpm storybook:test` (or whatever the runner script is).
3. Watch Chromium heap via `--js-flags="--expose-gc --trace-gc"` or
   open the runner DevTools and watch the heap snapshot grow
   monotonically from story 1 onward.
4. Around story file 70 the renderer process aborts with
   `RESULT_CODE_OUT_OF_MEMORY`.

## Expected

Stories that mount custom elements clean them up between tests. Either:

- The Storybook test runner explicitly calls
  `host.replaceChildren()` + a synthetic GC tick between stories.
- Each component's `connectedCallback` registers cleanup in
  `disconnectedCallback` for every listener (no global side effects
  that outlive the host).
- A per-file `afterEach` in the test runner config explicitly tears
  down the iframe document (`document.body.innerHTML = ''` + `gc()`).

CI runs all 100+ story files in a single browser session in <10 min.

## Actual

Renderer process aborts at file 70 with OOM. Watchdog kills the run
40+ min later. CI burns ~50 min per failed run.

## Source

- Helix: `packages/hx-library/src/components/**/*.stories.ts` (suspect
  components: anything that adds `window.addEventListener` in
  `connectedCallback` without symmetric `removeEventListener` in
  `disconnectedCallback` — likely candidates: hx-toast, hx-tooltip,
  hx-popup, hx-popover, hx-dialog, hx-drawer, hx-tabs).
- Audit reference: `4-20 Audit Findings.md:A6-H1` (vault)

## Root cause hypothesis

Two contributing factors:

1. **Component-side leaks**: HX-tier mixins (form-mixin, focus-mixin)
   and the floating-element components register
   document-level listeners (escape-key handler, click-outside
   handler) in `connectedCallback` and rely on
   `disconnectedCallback` to remove them — but Storybook's iframe
   doesn't always call `disconnectedCallback` reliably across story
   transitions.

2. **Runner config**: the Storybook + Vitest browser-mode integration
   doesn't reset the iframe between stories; it stacks story
   renderings into the same document.

## Suggested upstream fix

Two-pronged:

1. Audit each component's `connectedCallback`/`disconnectedCallback`
   pair. Confirm every globally-registered listener is removed.
   `AbortController` pattern (one signal per host, abort in
   disconnect) is the cleanest mechanic.

2. Add a runner-side reset in the Storybook config:

```js
// .storybook/test-runner.ts (or vitest config)
afterEach(async () => {
  document.body.innerHTML = '';
  if (typeof gc === 'function') gc();
  await new Promise((r) => setTimeout(r, 0));
});
```

Run with `--expose-gc` on the Chromium command line.

## Local workaround (if any)

create-helix-app's templates explicitly include `disconnectedCallback`
cleanup boilerplate so consumer components don't hit this. figma-tokens
doesn't run Storybook tests. No workaround for the upstream pipeline.

## Cross-references

- Related issues: (none direct)
- Related vault docs: 4-20 Audit Findings.md A6-H1

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #6.
