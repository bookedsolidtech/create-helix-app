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
  | 'stencil';

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

export type DrupalPreset = 'standard' | 'blog' | 'healthcare' | 'intranet';

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
