# BUG-XXX: --token-prefix flag drops values that begin with --

**Status:** draft
**Reported:** 2026-05-05T04:05:00Z
**Reporter:** Stream D dress rehearsal (manual scaffolding test)
**create-helix version:** 0.4.0 (working tree at 165fc09)
**Severity:** medium

## Summary

Invoking `node dist/index.js wellds --template wc-storybook --ds-name well --token-prefix=--well --no-install --json` succeeds and reports `success: true`, but the generated `scripts/build-tokens.ts` retains the default `const PREFIX = '--hx'` rather than the supplied `--well`. The CLI silently ignored the `--token-prefix` value.

## Reproduction

```bash
cd /tmp
rm -rf wellds
node /Volumes/Development/booked/create-helix-app/dist/index.js wellds \
  --template wc-storybook \
  --ds-name well \
  --token-prefix=--well \
  --no-install \
  --json
grep "const PREFIX" wellds/scripts/build-tokens.ts
# expected: const PREFIX = '--well';
# actual:   const PREFIX = '--hx';
```

## Expected

`wellds/scripts/build-tokens.ts` contains `const PREFIX = '--well';` so emitted CSS custom properties carry the `--well-*` brand prefix.

## Actual

The substitution falls back to the default `'--hx'`. The brand component (`well-button`, `WellButton`) is correctly named — only the CSS variable prefix slips back to default.

## Root cause hypothesis

`src/cli.ts` flag parser likely treats values starting with `--` as a new flag, not as a value for the previous flag. The `=`-form `--token-prefix=--well` should preserve the value but appears to drop it on the way through. Worth tracing in `parseArgs`-like logic in `src/cli.ts:380+`.

Sibling: `--ds-name well` works (the value doesn't start with `--`).

Note: this scenario was NOT covered by the Stream C codex P2 validation fix (`fix(cli): validate --ds-name and --token-prefix flags with the prompt regex`, commit `d345a6b`) because that fix added regex validation but did not change argument parsing — a value that never reaches the validator can't be caught there.

## Suggested fix

In the flag parser, when the next arg literally begins with `--`, prefer treating `--token-prefix --well` as `key=value` only if the value looks like a CSS custom property prefix (`/^--[a-z][a-z0-9_-]*$/i`). Or document that `--token-prefix=--well` is the only supported form and reject the space-separated form.

Add E2E test asserting both forms emit `const PREFIX = '--well';` in the generated build-tokens.ts.

## Workaround

For now, the bridge layer in `well-button.styles.ts` reads `--hx-*` because that's what HelixButton's internal CSS reads. Brand divergence is conveyed through the **token VALUES** in `tokens.json`, not through the variable name prefix. So `--token-prefix` failing silently does NOT block the live token loop demo — consistent `--hx-*` naming is actually the correct architectural choice for a brand layer.

A consumer who genuinely wants `--well-*` everywhere needs to either (a) post-edit the generated `build-tokens.ts`, or (b) use the interactive prompt mode where the prefix is captured correctly.

## Cross-references

- Stream C fix: commit `d345a6b` (regex validation, doesn't address parse)
- Discovered during: Stream D dress rehearsal at HEAD `165fc09`

## Discovery context

Generated `wellds` via `node dist/index.js` to validate Helix 3.3.1 alignment (Stream D). Inspected output to confirm scaffold quality. Found tokens.json + Track 1 + scripts all correct; only the `--token-prefix` flag silently fell through.
