import type { HookConfig, HookContext, HookFn, HookLifecycle } from '../types.js';

export class HookManager {
  private hooks: HookConfig[] = [];

  register(lifecycle: HookLifecycle, hook: HookFn, pluginName?: string): void {
    this.hooks.push({ lifecycle, hook, pluginName });
  }

  async run(lifecycle: HookLifecycle, context: HookContext): Promise<HookContext> {
    let ctx = context;
    const relevant = this.hooks.filter((h) => h.lifecycle === lifecycle);
    for (const { hook, pluginName } of relevant) {
      try {
        const result = await hook(ctx);
        if (result !== undefined && result !== null) {
          ctx = validateHookContext(result, ctx);
        }
      } catch (err) {
        const name = pluginName ?? 'unknown';
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Hook "${name}" [${lifecycle}] aborted: ${message}`);
      }
    }
    return ctx;
  }

  hasHooks(lifecycle: HookLifecycle): boolean {
    return this.hooks.some((h) => h.lifecycle === lifecycle);
  }

  get count(): number {
    return this.hooks.length;
  }
}

export function buildHookContext(
  projectName: string,
  template: string,
  outputDir: string,
  options: HookContext['options'],
  files: Record<string, string> = {},
): HookContext {
  return { projectName, template, outputDir, files, options };
}

function validateHookContext(result: HookContext, previous: HookContext): HookContext {
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof result.projectName !== 'string' ||
    typeof result.template !== 'string' ||
    typeof result.outputDir !== 'string' ||
    typeof result.files !== 'object' ||
    result.files === null ||
    typeof result.options !== 'object' ||
    result.options === null
  ) {
    throw new Error(
      `Hook returned invalid context. Expected HookContext shape but got: ${JSON.stringify(result)}. ` +
        `Previous context: projectName="${previous.projectName}"`,
    );
  }
  return result;
}
