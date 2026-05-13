# Follow-up: hx-theme element boot-time sync (deferred from v0.9.1)

## Source

Codex round 9 of the v0.9.1 cross-kit audit sweep flagged this as a P2.

## Issue

In the Next.js scaffold, the pre-hydration boot script in `app/layout.tsx`:

```js
(function() {
  try { var t = localStorage.getItem('helix-theme'); ... } catch(e) {}
  // sets document.documentElement.dataset.theme = ...
})();
```

...applies `data-theme` to `<html>` BEFORE React mounts. This means the page CSS (which uses `:root[data-theme]` selectors) paints with the right colors. But each `<hx-theme>` component in the page is server-rendered with `theme="auto"` and uses its own internal `theme` property to drive shadow-DOM styling. The boot script doesn't touch those properties.

Until `ThemeToggle`'s useEffect runs and calls `applyTheme` (which iterates `document.querySelectorAll('hx-theme')` and sets `.theme = next`), the hx-\* components briefly render in whichever color the `auto` value resolves to — likely `prefers-color-scheme`, which may differ from the user's saved theme.

**Visible symptom**: brief mixed-theme flash for users whose saved `helix-theme` disagrees with their OS-level `prefers-color-scheme`. Example: user manually flipped to "light" on a dark OS. Page background paints light immediately; hx-button + hx-card briefly paint dark, then snap to light when React mounts.

## Why deferred to a follow-up

1. **Edge case**: only affects users with a saved-theme + OS-theme disagreement. Most users either use their OS preference (no flash) or always switch via the UI (saved theme matches what they last saw).
2. **Fix complexity**: needs the boot script to:
   - Wait for customElements upgrade on `<hx-theme>` (which is async — happens after the @helixui/library import in `helix-setup.ts` resolves)
   - Iterate the elements and set the `.theme` property
   - Or — and this is cleaner — generate the page with `<hx-theme theme="{savedTheme}">` directly. Requires server-side knowledge of the saved theme, which we don't have without cookies.
3. **Workaround on the user side**: anyone who sees the flash can either (a) keep their UI choice aligned with OS preference, or (b) we can document a stop-gap CSS rule that hides hx-\* elements until upgraded.

## Resolution path

Two viable options, tracked for v0.10:

**Option A — Cookie-based SSR theming.** Store the user's choice in a cookie (in addition to localStorage). Next's Server Components read the cookie via `cookies()` and emit `<hx-theme theme="dark">` at SSR time. Zero JS needed for the right initial render. Tradeoff: requires Next-side runtime code, adds a cookie to the user's session.

**Option B — Boot-script polling.** Inline `<script>` waits for `customElements.whenDefined('hx-theme')`, then queries + sets `.theme` on each instance. Tradeoff: still async, still a brief flash, but BOUNDED by the customElements upgrade time (typically <50ms).

**Option C — `:not(:defined)` opacity gate.** A global CSS rule `hx-theme:not(:defined) { visibility: hidden }` hides hx-theme contents until the custom element upgrades. By the time it's visible, the React useEffect has already synced the theme. Tradeoff: brief blank where the components would be.

## Why not in this PR

v0.9.1 is a cross-kit audit harmonization PATCH release. Cookie-based SSR theming or polling boot logic is a NEW capability (v0.10 minor). The current behavior is identical to pre-v0.9.1; this PR doesn't regress anything.

## Audience

Path forward: when the user is awake, evaluate which option (A/B/C) aligns with their goals for v0.10. If the user picks Option A, also extend to the other React kit (react-vite) for parity. Astro + SvelteKit are unaffected because their pre-hydration boot scripts run synchronously and their hx-\* consumption happens AFTER the library loader's `<script>` block has already fired.
