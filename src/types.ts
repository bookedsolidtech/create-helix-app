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
