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
  features: string[];
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
}

export interface ComponentBundleConfig {
  id: ComponentBundle;
  name: string;
  description: string;
  components: string[];
}

export type DrupalPreset = 'standard' | 'blog' | 'healthcare' | 'intranet' | 'ecommerce';

export interface PresetConfig {
  id: DrupalPreset;
  name: string;
  description: string;
  sdcList: string[];
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
// Plugin Hook System Types
// ---------------------------------------------------------------------------

export type HookLifecycle = 'pre-scaffold' | 'post-scaffold' | 'pre-write' | 'post-write';

export interface HookContext {
  projectName: string;
  template: string;
  outputDir: string;
  files: Record<string, string>;
  options: ProjectOptions;
}

export type HookFn = (context: HookContext) => HookContext | void | Promise<HookContext | void>;

export interface HookConfig {
  lifecycle: HookLifecycle;
  hook: HookFn;
  pluginName?: string;
}

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
  hooks?: Partial<Record<HookLifecycle, HookFn>>;
  name?: string;
}
