---
id: HX-039
title: `README.drupal.md` only present on 8/83 components — Drupal SDC integration coverage gap
status: filed
category: documentation
severity: medium
reported: 2026-05-06T00:10:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: create-helix-app
related: []
---

# HX-039 — Drupal SDC docs missing from 75/83 components

## Summary

Helix ships `README.drupal.md` files on only 8 components, despite the
library being positioned as a Drupal-friendly design system. The 8
covered: hx-slider, hx-container, hx-steps, hx-icon-button,
hx-pagination, hx-meter, hx-button-group, hx-card. Every other
component (75 of them) lacks documented SDC integration guidance —
how to instantiate via `Drupal.behaviors`, what data shape the .twig
template expects, what slots map to SDC props.

`create-helix-app`'s Drupal-preset scaffolds rely on these docs; their
absence forces consumers to read the .twig templates + .ts source to
reverse-engineer the integration each time.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `find packages/hx-library/src/components -name "README.drupal.md" | wc -l`
   → 8.
3. `find packages/hx-library/src/components -name "*.twig" | wc -l`
   → 29 (so ~21 components have a .twig but no README).
4. `find packages/hx-library/src/components -maxdepth 1 -name "hx-*"
   -type d | wc -l` → 81 (component directories).
5. Coverage: 8/81 ≈ 10%.

## Expected

Every component (or at minimum every component that ships a `.twig`
template) has a `README.drupal.md` covering:

- SDC `component.yml` snippet showing prop types + slot definitions.
- `Drupal.behaviors.<componentName>` integration sample.
- Twig usage example with all common prop combinations.
- Known caveats (timing of element-upgrade vs Drupal AJAX, focus
  handling on dialog-style components, etc.).

A `docs/drupal-integration-template.md` shared template would
accelerate authoring.

## Actual

8 components have it; 73 don't. Consumers reverse-engineer.

## Source

- Helix: `packages/hx-library/src/components/*/README.drupal.md`
  (count: 8)

## Root cause hypothesis

Drupal docs were added ad-hoc as the integration team encountered
specific components in production. No systematic backfill happened.

## Suggested upstream fix

Two-pass:

1. Author a `docs/drupal-integration-template.md` covering the
   sections listed in "Expected." Use one of the existing 8
   READMEs (hx-card is the most complete) as the model.
2. Backfill the 73 missing READMEs, prioritized by
   create-helix-app's Drupal preset usage frequency (button,
   checkbox, alert, link, menu, accordion, table, dialog, etc.
   first).

## Local workaround (if any)

`create-helix-app/templates/drupal-*` includes inline integration
samples for the most common components. Coverage gap means we ship
the same boilerplate repeatedly across templates.

## Cross-references

- Related issues: (none direct)
- Related vault docs: Drupal Preset Integration Guide

## Status notes

- 2026-05-05: filed during D2-bis backfill.
