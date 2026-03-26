import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset, isValidPreset, VALID_PRESETS } from '../presets/loader.js';

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
    expect(preset.sdcList).toContain('provider-card');
    expect(preset.sdcList).toContain('appointment-cta');
  });

  it('healthcare preset includes blog SDCs', () => {
    const healthcare = getPreset('healthcare');
    // Healthcare builds on blog which builds on standard
    expect(healthcare.sdcList).toContain('node-teaser');
    expect(healthcare.sdcList).toContain('article-full');
    expect(healthcare.sdcList).toContain('provider-card');
  });

  it('healthcare preset includes condition-tag and medical-disclaimer', () => {
    const healthcare = getPreset('healthcare');
    expect(healthcare.sdcList).toContain('condition-tag');
    expect(healthcare.sdcList).toContain('medical-disclaimer');
  });

  it('intranet preset includes standard SDCs', () => {
    const intranet = getPreset('intranet');
    expect(intranet.sdcList).toContain('node-teaser');
    expect(intranet.sdcList).toContain('dashboard-card');
  });

  it('intranet preset includes all intranet-specific SDCs', () => {
    const intranet = getPreset('intranet');
    expect(intranet.sdcList).toContain('notification-banner');
    expect(intranet.sdcList).toContain('data-table-view');
    expect(intranet.sdcList).toContain('user-profile');
  });

  it('blog preset includes standard + blog SDCs', () => {
    const blog = getPreset('blog');
    expect(blog.sdcList).toContain('node-teaser');
    expect(blog.sdcList).toContain('article-full');
    expect(blog.sdcList).toContain('author-byline');
    expect(blog.sdcList).toContain('tag-cloud');
    expect(blog.sdcList).toContain('newsletter-signup');
  });

  it('standard preset has correct base SDCs', () => {
    const standard = getPreset('standard');
    expect(standard.sdcList).toContain('node-teaser');
    expect(standard.sdcList).toContain('views-grid');
    expect(standard.sdcList).toContain('hero-banner');
    expect(standard.sdcList).toContain('site-header');
    expect(standard.sdcList).toContain('site-footer');
    expect(standard.sdcList).toContain('breadcrumb');
    expect(standard.sdcList).toContain('search-form');
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
    expect(ecommerce.sdcList).toContain('node-teaser');
    expect(ecommerce.sdcList).toContain('product-card');
    expect(ecommerce.sdcList).toContain('product-grid');
    expect(ecommerce.sdcList).toContain('price-display');
    expect(ecommerce.sdcList).toContain('cart-summary');
    expect(ecommerce.sdcList).toContain('checkout-form');
    expect(ecommerce.sdcList).toContain('category-nav');
    expect(ecommerce.sdcList).toContain('search-filters');
    expect(ecommerce.sdcList).toContain('review-stars');
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
});
