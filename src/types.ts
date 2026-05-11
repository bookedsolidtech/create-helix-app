export type Framework =
  | 'react-next'
  | 'react-vite'
  | 'remix'
  | 'vue-nuxt'
  | 'vue-vite'
  | 'solid-vite'
  | 'qwik-vite'
  | 'svelte-kit'
  | 'angular'
  | 'astro'
  | 'vanilla'
  | 'lit-vite'
  | 'wc-storybook'
  | 'preact-vite'
  | 'stencil'
  | 'ember';

export type ComponentBundle =
  | 'all'
  | 'core'
  | 'forms'
  | 'navigation'
  | 'data-display'
  | 'feedback'
  | 'layout';

export interface TemplateConfig {
  id: Framework;
  name: string;
  description: string;
  hint: string;
  color: (text: string) => string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /**
   * Optional peer-dependency pins. Used by design-system-factory templates
   * (e.g. wc-storybook) to communicate the cascade-token contract version
   * the consumer host MUST satisfy. Plain `dependencies` still cover the
   * dev-time install; `peerDependencies` document the consumer-facing
   * version range.
   */
  peerDependencies?: Record<string, string>;
  features: string[];
  /**
   * When true, the template is hidden from the interactive framework prompt
   * and from the default `create-helix list` output. v0.6.0 Phase C marks
   * 13 stub-quality scaffolders as experimental so consumers default to the
   * 3 production frameworks (wc-storybook, react-next, react-vite) — the
   * Drupal flow lives on its own path. Pass `--show-experimental` to
   * re-include them in prompts/lists; API callers (scaffold({framework: ...}))
   * bypass this filter entirely so existing integrations keep working.
   */
  experimental?: boolean;
}

/**
 * A custom template definition loaded from a user-provided templateDir.
 * Follows the same structure as TemplateConfig but with an unconstrained
 * string id and an isCustom flag for display purposes.
 */
export interface CustomTemplateConfig {
  id: string;
  name: string;
  description: string;
  hint: string;
  color: (text: string) => string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
  features: string[];
  isCustom: true;
}

/** Union of built-in and custom template configs. */
export type AnyTemplateConfig = TemplateConfig | CustomTemplateConfig;

/**
 * A hero scenario authored at scaffold time and rendered into the
 * generated wc-storybook factory's per-component MDX docs page. Each
 * scenario contextualizes a component inside a real product moment
 * (e.g. a sign-in form, an intake flow) so the Storybook surface
 * reads as a brand experience rather than a generic catalog.
 *
 * Scaffolder threads zero or more scenarios through to the wc-storybook
 * generator. Empty list falls back to cross-domain neutral defaults
 * (per `feedback_realistic_sample_data` memory rule).
 */
export interface HeroScenario {
  /** The component tag the scenario contextualizes (e.g. "spike-button"). */
  componentId: string;
  /** Heading shown above the scene (e.g. "Sign in to Your Workspace"). */
  title: string;
  /** Short narrative body describing the scenario context. */
  body: string;
}

export interface ProjectOptions {
  name: string;
  directory: string;
  framework: Framework;
  componentBundles: ComponentBundle[];
  typescript: boolean;
  eslint: boolean;
  designTokens: boolean;
  darkMode: boolean;
  installDeps: boolean;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  /** Design system codename — drives element tag prefix and JS class prefix (e.g. 'bolt' → bolt-button, BoltButton) */
  dsName?: string;
  /** CSS custom property token prefix (e.g. '--bolt') — drives all generated CSS var() names */
  tokenPrefix?: string;
  /**
   * Brand tagline rendered into the wc-storybook Cover and Brand MDX
   * pages. Optional — falls back to a cross-domain neutral default
   * ("Design system extending HELiX") when omitted.
   * Currently consumed only by the wc-storybook factory.
   */
  brandTagline?: string;
  /**
   * Brand verticals (markets, domains) the design system is targeting,
   * e.g. ['fintech', 'wellness']. Drives the wc-storybook brand
   * toolbar dropdown — empty list suppresses the dropdown (single-brand
   * mode). Currently consumed only by the wc-storybook factory.
   */
  brandVerticals?: string[];
  /**
   * Hero scenarios for the wc-storybook factory's per-component MDX.
   * Each scenario provides a contextualized hero scene for one component
   * tag. Empty list falls back to cross-domain neutral defaults
   * (form sign-in, intake, confirmation, navigation).
   * Currently consumed only by the wc-storybook factory.
   */
  heroScenarios?: HeroScenario[];
}

export interface ComponentBundleConfig {
  id: ComponentBundle;
  name: string;
  description: string;
  components: string[];
}

export type DrupalPreset = 'standard' | 'blog' | 'healthcare' | 'intranet' | 'ecommerce';

export type SDCGroup =
  | 'block'
  | 'node'
  | 'views'
  | 'paragraph'
  | 'navigation'
  | 'form'
  | 'dashboard';

export interface SDCDefinition {
  name: string;
  group: SDCGroup;
  helixComponents: string[];
  templateOverride?: string;
}

export interface PresetConfig {
  id: DrupalPreset;
  name: string;
  description: string;
  sdcList: SDCDefinition[];
  dependencies: Record<string, string>;
  templateVars: Record<string, string>;
  architectureNotes: string;
}

export interface DrupalOptions {
  themeName: string;
  directory: string;
  preset: DrupalPreset;
}

// ---------------------------------------------------------------------------
// Plugin Hook System Types — re-exported from plugins/hooks for external use
// ---------------------------------------------------------------------------

export type HookLifecycle = 'pre-scaffold' | 'post-scaffold' | 'pre-write' | 'post-write';

export type { HookContext, HookFn } from './plugins/hooks.js';

export interface HelixRcHooks {
  'pre-scaffold'?: string;
  'post-scaffold'?: string;
  'pre-write'?: string;
  'post-write'?: string;
}

export interface HelixRc {
  hooks?: HelixRcHooks;
}

export interface PluginModule {
  hooks?: Partial<Record<HookLifecycle, import('./plugins/hooks.js').HookFn>>;
  name?: string;
}
