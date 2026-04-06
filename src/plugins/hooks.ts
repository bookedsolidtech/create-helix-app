/**
 * HookManager — lightweight synchronous/async hook system for the plugin
 * pipeline.  Hooks are keyed by name and executed in registration order.
 */

export type HookContext = {
  /** Name of the project being scaffolded. */
  projectName: string;
  /** Absolute path to the output directory. */
  directory: string;
  /** Arbitrary extra values supplied by the caller. */
  [key: string]: unknown;
};

export type HookFn = (context: HookContext) => void | Promise<void>;

/**
 * Manages named hooks that can be registered and executed in order.
 */
export class HookManager {
  private readonly hooks: Map<string, HookFn[]> = new Map();

  /**
   * Register a handler for the given hook name.
   *
   * @param name  - Hook identifier (e.g. "beforeScaffold", "afterScaffold").
   * @param fn    - Handler to invoke when the hook fires.
   */
  register(name: string, fn: HookFn): void {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    (this.hooks.get(name) ?? []).push(fn);
  }

  /**
   * Execute all handlers for the given hook name in registration order.
   * Each handler is awaited before the next is called.
   *
   * @param name    - Hook name to fire.
   * @param context - Context object passed to every handler.
   */
  async execute(name: string, context: HookContext): Promise<void> {
    const handlers = this.hooks.get(name) ?? [];
    for (const fn of handlers) {
      await fn(context);
    }
  }

  /**
   * Return the number of handlers registered for a given hook name.
   */
  count(name: string): number {
    return this.hooks.get(name)?.length ?? 0;
  }

  /**
   * Return all registered hook names.
   */
  names(): string[] {
    return Array.from(this.hooks.keys());
  }
}

/**
 * Build a minimal `HookContext` from raw scaffold options.
 *
 * @param projectName - Name of the project.
 * @param directory   - Output directory path.
 * @param extras      - Any additional context properties.
 */
export function buildHookContext(
  projectName: string,
  directory: string,
  extras: Record<string, unknown> = {},
): HookContext {
  return { projectName, directory, ...extras };
}
