import { describe, it, expect, vi } from 'vitest';
import { HookManager, buildHookContext } from '../../src/plugins/hooks.js';
import type { HookContext, ProjectOptions } from '../../src/types.js';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-app',
    directory: '/tmp/test-app',
    framework: 'react-next',
    componentBundles: ['all'],
    typescript: true,
    eslint: true,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

function makeContext(overrides: Partial<HookContext> = {}): HookContext {
  return buildHookContext(
    overrides.projectName ?? 'test-app',
    overrides.template ?? 'react-next',
    overrides.outputDir ?? '/tmp/test-app',
    overrides.options ?? makeOptions(),
    overrides.files ?? {},
  );
}

describe('HookManager — registration', () => {
  it('starts with zero hooks', () => {
    const manager = new HookManager();
    expect(manager.count).toBe(0);
  });

  it('increments count on register', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    manager.register('post-scaffold', vi.fn());
    expect(manager.count).toBe(2);
  });

  it('hasHooks returns false when no hooks registered', () => {
    const manager = new HookManager();
    expect(manager.hasHooks('pre-scaffold')).toBe(false);
  });

  it('hasHooks returns true after registering for lifecycle', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    expect(manager.hasHooks('pre-scaffold')).toBe(true);
    expect(manager.hasHooks('post-scaffold')).toBe(false);
  });
});

describe('HookManager — lifecycle events', () => {
  it('fires pre-scaffold hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-scaffold', hook);
    const ctx = makeContext();
    await manager.run('pre-scaffold', ctx);
    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(ctx);
  });

  it('fires post-scaffold hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('post-scaffold', hook);
    const ctx = makeContext();
    await manager.run('post-scaffold', ctx);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('fires pre-write hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-write', hook);
    const ctx = makeContext();
    await manager.run('pre-write', ctx);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('fires post-write hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('post-write', hook);
    const ctx = makeContext();
    await manager.run('post-write', ctx);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('does not fire hooks for other lifecycles', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-scaffold', hook);
    const ctx = makeContext();
    await manager.run('post-scaffold', ctx);
    expect(hook).not.toHaveBeenCalled();
  });

  it('fires all hooks for the same lifecycle in registration order', async () => {
    const order: number[] = [];
    const manager = new HookManager();
    manager.register('pre-scaffold', () => {
      order.push(1);
    });
    manager.register('pre-scaffold', () => {
      order.push(2);
    });
    manager.register('pre-scaffold', () => {
      order.push(3);
    });
    await manager.run('pre-scaffold', makeContext());
    expect(order).toEqual([1, 2, 3]);
  });

  it('returns unmodified context when hook returns void', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', () => {
      /* void */
    });
    const ctx = makeContext();
    const result = await manager.run('pre-scaffold', ctx);
    expect(result).toEqual(ctx);
  });
});

describe('HookManager — modify context', () => {
  it('allows hook to modify projectName', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', (ctx) => ({
      ...ctx,
      projectName: 'modified-name',
    }));
    const result = await manager.run('pre-scaffold', makeContext());
    expect(result.projectName).toBe('modified-name');
  });

  it('allows hook to modify outputDir', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', (ctx) => ({
      ...ctx,
      outputDir: '/tmp/new-output',
    }));
    const result = await manager.run('pre-scaffold', makeContext());
    expect(result.outputDir).toBe('/tmp/new-output');
  });

  it('allows hook to modify files', async () => {
    const manager = new HookManager();
    manager.register('pre-write', (ctx) => ({
      ...ctx,
      files: { 'index.html': '<html/>' },
    }));
    const result = await manager.run('pre-write', makeContext());
    expect(result.files['index.html']).toBe('<html/>');
  });

  it('passes modified context from one hook to the next', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', (ctx) => ({ ...ctx, projectName: 'first' }));
    manager.register('pre-scaffold', (ctx) => ({
      ...ctx,
      projectName: ctx.projectName + '-second',
    }));
    const result = await manager.run('pre-scaffold', makeContext());
    expect(result.projectName).toBe('first-second');
  });
});

describe('HookManager — abort on error', () => {
  it('throws when a hook throws', async () => {
    const manager = new HookManager();
    manager.register(
      'pre-scaffold',
      () => {
        throw new Error('hook failed intentionally');
      },
      'test-plugin',
    );
    await expect(manager.run('pre-scaffold', makeContext())).rejects.toThrow(
      'Hook "test-plugin" [pre-scaffold] aborted: hook failed intentionally',
    );
  });

  it('stops executing subsequent hooks after abort', async () => {
    const manager = new HookManager();
    const secondHook = vi.fn();
    manager.register('pre-scaffold', () => {
      throw new Error('abort!');
    });
    manager.register('pre-scaffold', secondHook);
    await expect(manager.run('pre-scaffold', makeContext())).rejects.toThrow();
    expect(secondHook).not.toHaveBeenCalled();
  });

  it('includes hook name in error when pluginName provided', async () => {
    const manager = new HookManager();
    manager.register(
      'post-scaffold',
      () => {
        throw new Error('bad');
      },
      'my-plugin',
    );
    await expect(manager.run('post-scaffold', makeContext())).rejects.toThrow('my-plugin');
  });
});

describe('HookManager — invalid context validation', () => {
  it('throws when hook returns invalid context', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', () => ({ invalid: true }) as unknown as HookContext);
    await expect(manager.run('pre-scaffold', makeContext())).rejects.toThrow(
      'Hook returned invalid context',
    );
  });

  it('accepts null return (treated as void)', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', () => null as unknown as void);
    const ctx = makeContext();
    const result = await manager.run('pre-scaffold', ctx);
    expect(result).toEqual(ctx);
  });
});

describe('.helixrc.json lifecycle', () => {
  it('buildHookContext creates correct context shape', () => {
    const opts = makeOptions();
    const ctx = buildHookContext('my-app', 'react-next', '/tmp/my-app', opts);
    expect(ctx.projectName).toBe('my-app');
    expect(ctx.template).toBe('react-next');
    expect(ctx.outputDir).toBe('/tmp/my-app');
    expect(ctx.options).toBe(opts);
    expect(ctx.files).toEqual({});
  });

  it('buildHookContext accepts custom files', () => {
    const opts = makeOptions();
    const ctx = buildHookContext('my-app', 'react-next', '/tmp/my-app', opts, {
      'a.ts': 'content',
    });
    expect(ctx.files).toEqual({ 'a.ts': 'content' });
  });
});
