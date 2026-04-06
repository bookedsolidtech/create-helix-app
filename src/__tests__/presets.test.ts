import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset, isValidPreset, VALID_PRESETS } from '../presets/loader.js';

// Helper: check if an sdcList contains an SDC by name
function hasSdc(sdcList: { name: string }[], name: string): boolean {
  return sdcList.some((s) => s.name === name);
}

describe('preset loader', () => {
  it('has 5 presets', () => {
    expect(PRESETS).toHaveLength(5);
  });

  it('VALID_PRESETS contains all 5 preset ids', () => {
    expect(VALID_PRESETS).toHaveLength(5);
    expect(VALID_PRESETS).toContain('standard');
    expect(VALID_PRESETS).toContain('blog');
    expect(VALID_PRESETS).toContain('healthcare');
    expect(VALID_PRESETS).toContain('intranet');
    expect(VALID_PRESETS).toContain('ecommerce');
  });

  it('validates preset names', () => {
    expect(isValidPreset('standard')).toBe(true);
    expect(isValidPreset('blog')).toBe(true);
    expect(isValidPreset('healthcare')).toBe(true);
    expect(isValidPreset('intranet')).toBe(true);
    expect(isValidPreset('ecommerce')).toBe(true);
    expect(isValidPreset('invalid')).toBe(false);
    expect(isValidPreset('')).toBe(false);
  });

  it('returns preset by id', () => {
    const preset = getPreset('healthcare');
    expect(preset.id).toBe('healthcare');
    expect(hasSdc(preset.sdcList, 'provider-card')).toBe(true);
    expect(hasSdc(preset.sdcList, 'appointment-cta')).toBe(true);
  });

  it('SDCDefinition entries have name, group, and helixComponents', () => {
    const standard = getPreset('standard');
    for (const sdc of standard.sdcList) {
      expect(typeof sdc.name).toBe('string');
      expect(sdc.name.length).toBeGreaterThan(0);
      expect(typeof sdc.group).toBe('string');
      expect(Array.isArray(sdc.helixComponents)).toBe(true);
    }
  });

  it('healthcare preset includes blog SDCs', () => {
    const healthcare = getPreset('healthcare');
    expect(hasSdc(healthcare.sdcList, 'node-teaser')).toBe(true);
    expect(hasSdc(healthcare.sdcList, 'article-full')).toBe(true);
    expect(hasSdc(healthcare.sdcList, 'provider-card')).toBe(true);
  });

  it('healthcare preset includes condition-tag and medical-disclaimer', () => {
    const healthcare = getPreset('healthcare');
    expect(hasSdc(healthcare.sdcList, 'condition-tag')).toBe(true);
    expect(hasSdc(healthcare.sdcList, 'medical-disclaimer')).toBe(true);
  });

  it('intranet preset includes standard SDCs', () => {
    const intranet = getPreset('intranet');
    expect(hasSdc(intranet.sdcList, 'node-teaser')).toBe(true);
    expect(hasSdc(intranet.sdcList, 'dashboard-card')).toBe(true);
  });

  it('intranet preset includes all intranet-specific SDCs', () => {
    const intranet = getPreset('intranet');
    expect(hasSdc(intranet.sdcList, 'notification-banner')).toBe(true);
    expect(hasSdc(intranet.sdcList, 'data-table-view')).toBe(true);
    expect(hasSdc(intranet.sdcList, 'user-profile')).toBe(true);
  });

  it('blog preset includes standard + blog SDCs', () => {
    const blog = getPreset('blog');
    expect(hasSdc(blog.sdcList, 'node-teaser')).toBe(true);
    expect(hasSdc(blog.sdcList, 'article-full')).toBe(true);
    expect(hasSdc(blog.sdcList, 'author-byline')).toBe(true);
    expect(hasSdc(blog.sdcList, 'tag-cloud')).toBe(true);
    expect(hasSdc(blog.sdcList, 'newsletter-signup')).toBe(true);
  });

  it('standard preset has correct base SDCs', () => {
    const standard = getPreset('standard');
    expect(hasSdc(standard.sdcList, 'node-teaser')).toBe(true);
    expect(hasSdc(standard.sdcList, 'content-grid')).toBe(true);
    expect(hasSdc(standard.sdcList, 'hero-banner')).toBe(true);
    expect(hasSdc(standard.sdcList, 'site-header')).toBe(true);
    expect(hasSdc(standard.sdcList, 'site-footer')).toBe(true);
    expect(hasSdc(standard.sdcList, 'breadcrumb')).toBe(true);
    expect(hasSdc(standard.sdcList, 'search-form')).toBe(true);
  });

  it('all presets have @helixui/drupal-starter dependency', () => {
    for (const preset of PRESETS) {
      expect(preset.dependencies).toHaveProperty('@helixui/drupal-starter');
    }
  });

  it('all presets have @helixui/tokens dependency', () => {
    for (const preset of PRESETS) {
      expect(preset.dependencies).toHaveProperty('@helixui/tokens');
    }
  });

  it('ecommerce preset includes standard + ecommerce-specific SDCs', () => {
    const ecommerce = getPreset('ecommerce');
    expect(hasSdc(ecommerce.sdcList, 'node-teaser')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'product-card')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'product-grid')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'price-display')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'cart-summary')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'checkout-form')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'category-nav')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'search-filters')).toBe(true);
    expect(hasSdc(ecommerce.sdcList, 'review-stars')).toBe(true);
  });

  it('ecommerce preset has @helixui/commerce dependency', () => {
    const ecommerce = getPreset('ecommerce');
    expect(ecommerce.dependencies).toHaveProperty('@helixui/commerce');
  });

  it('throws for unknown preset id', () => {
    expect(() => getPreset('unknown' as Parameters<typeof getPreset>[0])).toThrow('Unknown preset');
  });

  it('each preset has architectureNotes', () => {
    for (const preset of PRESETS) {
      expect(typeof preset.architectureNotes).toBe('string');
      expect(preset.architectureNotes.length).toBeGreaterThan(0);
    }
  });

  it('node-teaser SDC has correct group and helixComponents', () => {
    const standard = getPreset('standard');
    const nodeTeaserSdc = standard.sdcList.find((s) => s.name === 'node-teaser');
    expect(nodeTeaserSdc).toBeDefined();
    expect(nodeTeaserSdc?.group).toBe('node');
    expect(nodeTeaserSdc?.helixComponents).toContain('hx-card');
  });

  it('site-header SDC has block group', () => {
    const standard = getPreset('standard');
    const siteHeader = standard.sdcList.find((s) => s.name === 'site-header');
    expect(siteHeader?.group).toBe('block');
  });

  it('content-grid SDC has views group', () => {
    const standard = getPreset('standard');
    const contentGrid = standard.sdcList.find((s) => s.name === 'content-grid');
    expect(contentGrid?.group).toBe('views');
  });
});
