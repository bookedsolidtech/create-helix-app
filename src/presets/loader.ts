import type { PresetConfig, DrupalPreset, SDCDefinition } from '../types.js';
import { HelixError, ErrorCode } from '../errors.js';

export const VALID_PRESETS: DrupalPreset[] = [
  'standard',
  'blog',
  'healthcare',
  'intranet',
  'ecommerce',
];

export function isValidPreset(preset: string): preset is DrupalPreset {
  return VALID_PRESETS.includes(preset as DrupalPreset);
}

const STANDARD_SDCS: SDCDefinition[] = [
  {
    name: 'node-teaser',
    group: 'node',
    helixComponents: ['hx-card', 'hx-badge', 'hx-text', 'hx-avatar'],
    templateOverride: 'node/node--article--teaser.html.twig',
  },
  {
    name: 'content-grid',
    group: 'views',
    helixComponents: ['hx-card'],
    templateOverride: 'views/views-view--content.html.twig',
  },
  {
    name: 'site-header',
    group: 'block',
    helixComponents: ['hx-container'],
    templateOverride: 'block/block--system-branding-block.html.twig',
  },
  {
    name: 'site-footer',
    group: 'block',
    helixComponents: ['hx-footer', 'hx-link', 'hx-icon'],
  },
  {
    name: 'breadcrumb',
    group: 'block',
    helixComponents: ['hx-breadcrumb'],
    templateOverride: 'block/block--system-breadcrumb-block.html.twig',
  },
  {
    name: 'search-form',
    group: 'block',
    helixComponents: ['hx-text-input', 'hx-button'],
    templateOverride: 'block/block--search-form-block.html.twig',
  },
  {
    name: 'hero-banner',
    group: 'block',
    helixComponents: ['hx-hero', 'hx-text', 'hx-button'],
  },
];

const BLOG_ADDITIONAL: SDCDefinition[] = [
  {
    name: 'article-full',
    group: 'node',
    helixComponents: ['hx-hero', 'hx-badge', 'hx-avatar', 'hx-button'],
    templateOverride: 'node/node--article--full.html.twig',
  },
  {
    name: 'author-byline',
    group: 'node',
    helixComponents: ['hx-avatar', 'hx-text'],
  },
  {
    name: 'related-articles',
    group: 'views',
    helixComponents: ['hx-card', 'hx-text'],
  },
  {
    name: 'tag-cloud',
    group: 'block',
    helixComponents: ['hx-badge'],
  },
  {
    name: 'newsletter-signup',
    group: 'block',
    helixComponents: ['hx-dialog', 'hx-text-input', 'hx-button'],
  },
];

const HEALTHCARE_ADDITIONAL: SDCDefinition[] = [
  {
    name: 'provider-card',
    group: 'node',
    helixComponents: ['hx-card', 'hx-text', 'hx-button'],
    templateOverride: 'node/node--provider--teaser.html.twig',
  },
  {
    name: 'appointment-cta',
    group: 'block',
    helixComponents: ['hx-button'],
  },
  {
    name: 'condition-tag',
    group: 'block',
    helixComponents: ['hx-badge', 'hx-text'],
  },
  {
    name: 'medical-disclaimer',
    group: 'block',
    helixComponents: ['hx-alert'],
  },
];

const INTRANET_ADDITIONAL: SDCDefinition[] = [
  {
    name: 'dashboard-card',
    group: 'block',
    helixComponents: ['hx-card', 'hx-text'],
  },
  {
    name: 'notification-banner',
    group: 'block',
    helixComponents: ['hx-alert'],
  },
  {
    name: 'data-table-view',
    group: 'views',
    helixComponents: ['hx-data-table'],
  },
  {
    name: 'user-profile',
    group: 'block',
    helixComponents: ['hx-avatar', 'hx-text'],
  },
];

const ECOMMERCE_ADDITIONAL: SDCDefinition[] = [
  {
    name: 'product-card',
    group: 'node',
    helixComponents: ['hx-card', 'hx-badge', 'hx-text', 'hx-button'],
    templateOverride: 'node/node--product--teaser.html.twig',
  },
  {
    name: 'product-grid',
    group: 'views',
    helixComponents: ['hx-card'],
    templateOverride: 'views/views-view--products.html.twig',
  },
  {
    name: 'price-display',
    group: 'block',
    helixComponents: ['hx-text'],
  },
  {
    name: 'cart-summary',
    group: 'block',
    helixComponents: ['hx-card', 'hx-button'],
  },
  {
    name: 'checkout-form',
    group: 'block',
    helixComponents: ['hx-text-input', 'hx-select', 'hx-button'],
  },
  {
    name: 'category-nav',
    group: 'block',
    helixComponents: ['hx-side-nav'],
  },
  {
    name: 'search-filters',
    group: 'block',
    helixComponents: ['hx-select', 'hx-checkbox'],
  },
  {
    name: 'review-stars',
    group: 'block',
    helixComponents: ['hx-text'],
  },
];

const BLOG_SDCS: SDCDefinition[] = [...STANDARD_SDCS, ...BLOG_ADDITIONAL];
const HEALTHCARE_SDCS: SDCDefinition[] = [...BLOG_SDCS, ...HEALTHCARE_ADDITIONAL];
const INTRANET_SDCS: SDCDefinition[] = [...STANDARD_SDCS, ...INTRANET_ADDITIONAL];
const ECOMMERCE_SDCS: SDCDefinition[] = [...STANDARD_SDCS, ...ECOMMERCE_ADDITIONAL];

const SHARED_DEPENDENCIES: Record<string, string> = {
  '@helixui/drupal-starter': '^0.1.0',
  '@helixui/tokens': '^0.2.0',
};

export const PRESETS: PresetConfig[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Core Drupal SDCs for a general-purpose Drupal theme.',
    sdcList: STANDARD_SDCS,
    dependencies: { ...SHARED_DEPENDENCIES },
    templateVars: {},
    architectureNotes:
      'Includes core content display, navigation, and search patterns suitable for most Drupal sites.',
  },
  {
    id: 'blog',
    name: 'Blog',
    description: 'Standard SDCs plus blog-specific content components.',
    sdcList: BLOG_SDCS,
    dependencies: { ...SHARED_DEPENDENCIES },
    templateVars: {},
    architectureNotes:
      'Extends standard with article display, authoring, taxonomy, and newsletter patterns.',
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'Blog SDCs plus healthcare-specific components (HIPAA-aware).',
    sdcList: HEALTHCARE_SDCS,
    dependencies: { ...SHARED_DEPENDENCIES },
    templateVars: {},
    architectureNotes:
      'Extends blog with provider directory, appointment flows, condition taxonomy, and medical disclaimers. HIPAA-aware component boundaries.',
  },
  {
    id: 'intranet',
    name: 'Intranet',
    description: 'Standard SDCs plus intranet and employee portal components.',
    sdcList: INTRANET_SDCS,
    dependencies: { ...SHARED_DEPENDENCIES },
    templateVars: {},
    architectureNotes:
      'Extends standard with dashboard widgets, notifications, data tables, and user profile patterns for internal applications.',
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    description: 'Product catalog, cart, and checkout components.',
    sdcList: ECOMMERCE_SDCS,
    dependencies: {
      ...SHARED_DEPENDENCIES,
      '@helixui/commerce': '^0.1.0',
    },
    templateVars: {
      commerceProvider: 'drupal_commerce',
      currencyFormat: 'USD',
    },
    architectureNotes:
      'Integrates with Drupal Commerce for product management. Includes product display, cart, checkout, and catalog navigation patterns.',
  },
];

export function getPreset(id: DrupalPreset): PresetConfig {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new HelixError(
      ErrorCode.INVALID_PRESET,
      `Unknown preset: "${id}". Valid presets: ${VALID_PRESETS.join(', ')}`,
    );
  }
  return preset;
}
