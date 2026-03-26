import { describe, it, expect } from 'vitest';
import { COMPONENT_BUNDLES, getComponentsForBundles } from '../../../src/templates.js';

// Documented bundle sizes from templates.ts descriptions
const DOCUMENTED_BUNDLE_SIZES: Record<string, number> = {
  core: 14, // button, icon-button, button-group, split-button, card, badge, text, icon, avatar, divider, chip, tag, tooltip, popover
  forms: 17, // text-input, select, checkbox, checkbox-group, radio-group, switch, textarea, field, field-label, field-help-text, combobox, slider, range-slider, color-picker, date-picker, time-picker, file-upload
  navigation: 12, // nav, side-nav, tabs, tab, tab-panel, breadcrumb, pagination, menu, menu-item, overflow-menu, tree-view, tree-item
  'data-display': 10, // data-table, stat, counter, progress-bar, progress-ring, meter, structured-list, rating, code-snippet, status-indicator
  feedback: 8, // alert, toast, dialog, drawer, banner, skeleton, spinner, loading-bar
  layout: 11, // grid, stack, split-panel, accordion, accordion-item, carousel, carousel-item, container, visually-hidden, resize-observer, scroll-area
};

describe('component bundle — sizes', () => {
  it.each(Object.entries(DOCUMENTED_BUNDLE_SIZES))(
    '%s bundle has exactly %i components',
    (bundleId, expectedCount) => {
      const bundle = COMPONENT_BUNDLES.find((b) => b.id === bundleId);
      expect(bundle).toBeDefined();
      expect(bundle!.components).toHaveLength(expectedCount);
    },
  );

  it('"all" bundle uses wildcard and is not counted in documented sizes', () => {
    const allBundle = COMPONENT_BUNDLES.find((b) => b.id === 'all');
    expect(allBundle).toBeDefined();
    expect(allBundle!.components).toEqual(['*']);
    expect(allBundle!.components).toHaveLength(1);
  });
});

describe('component bundle — no duplicates across all named bundles', () => {
  it('no component appears in more than one named bundle', () => {
    const namedBundles = COMPONENT_BUNDLES.filter((b) => b.id !== 'all');
    const allComponents: string[] = [];

    for (const bundle of namedBundles) {
      allComponents.push(...bundle.components);
    }

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const component of allComponents) {
      if (seen.has(component)) {
        duplicates.push(component);
      }
      seen.add(component);
    }

    expect(duplicates).toEqual([]);
  });
});

describe('component bundle — correct components per bundle', () => {
  it('core bundle contains all 14 expected components', () => {
    const core = COMPONENT_BUNDLES.find((b) => b.id === 'core')!;
    const expected = [
      'hx-button',
      'hx-icon-button',
      'hx-button-group',
      'hx-split-button',
      'hx-card',
      'hx-badge',
      'hx-text',
      'hx-icon',
      'hx-avatar',
      'hx-divider',
      'hx-chip',
      'hx-tag',
      'hx-tooltip',
      'hx-popover',
    ];
    expect(core.components).toEqual(expected);
  });

  it('forms bundle contains all 17 expected components', () => {
    const forms = COMPONENT_BUNDLES.find((b) => b.id === 'forms')!;
    const expected = [
      'hx-text-input',
      'hx-select',
      'hx-checkbox',
      'hx-checkbox-group',
      'hx-radio-group',
      'hx-switch',
      'hx-textarea',
      'hx-field',
      'hx-field-label',
      'hx-field-help-text',
      'hx-combobox',
      'hx-slider',
      'hx-range-slider',
      'hx-color-picker',
      'hx-date-picker',
      'hx-time-picker',
      'hx-file-upload',
    ];
    expect(forms.components).toEqual(expected);
  });

  it('navigation bundle contains all 12 expected components', () => {
    const nav = COMPONENT_BUNDLES.find((b) => b.id === 'navigation')!;
    const expected = [
      'hx-nav',
      'hx-side-nav',
      'hx-tabs',
      'hx-tab',
      'hx-tab-panel',
      'hx-breadcrumb',
      'hx-pagination',
      'hx-menu',
      'hx-menu-item',
      'hx-overflow-menu',
      'hx-tree-view',
      'hx-tree-item',
    ];
    expect(nav.components).toEqual(expected);
  });

  it('data-display bundle contains all 10 expected components', () => {
    const dataDisplay = COMPONENT_BUNDLES.find((b) => b.id === 'data-display')!;
    const expected = [
      'hx-data-table',
      'hx-stat',
      'hx-counter',
      'hx-progress-bar',
      'hx-progress-ring',
      'hx-meter',
      'hx-structured-list',
      'hx-rating',
      'hx-code-snippet',
      'hx-status-indicator',
    ];
    expect(dataDisplay.components).toEqual(expected);
  });

  it('feedback bundle contains all 8 expected components', () => {
    const feedback = COMPONENT_BUNDLES.find((b) => b.id === 'feedback')!;
    const expected = [
      'hx-alert',
      'hx-toast',
      'hx-dialog',
      'hx-drawer',
      'hx-banner',
      'hx-skeleton',
      'hx-spinner',
      'hx-loading-bar',
    ];
    expect(feedback.components).toEqual(expected);
  });

  it('layout bundle contains all 11 expected components', () => {
    const layout = COMPONENT_BUNDLES.find((b) => b.id === 'layout')!;
    const expected = [
      'hx-grid',
      'hx-stack',
      'hx-split-panel',
      'hx-accordion',
      'hx-accordion-item',
      'hx-carousel',
      'hx-carousel-item',
      'hx-container',
      'hx-visually-hidden',
      'hx-resize-observer',
      'hx-scroll-area',
    ];
    expect(layout.components).toEqual(expected);
  });
});

describe('component bundle — getComponentsForBundles integration', () => {
  it('all named bundles together produce 72 unique components', () => {
    const allNamedBundleIds = COMPONENT_BUNDLES.filter((b) => b.id !== 'all').map((b) => b.id);
    const components = getComponentsForBundles(allNamedBundleIds);
    // 14 + 17 + 12 + 10 + 8 + 11 = 72, no duplicates across bundles
    expect(components).toHaveLength(72);
  });

  it('selecting "all" short-circuits and returns wildcard regardless of other selections', () => {
    const allBundleIds = COMPONENT_BUNDLES.map((b) => b.id);
    const components = getComponentsForBundles(allBundleIds);
    expect(components).toEqual(['*']);
  });
});
