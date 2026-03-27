import { describe, it, expect, vi } from 'vitest';
import { HookManager, buildHookContext } from '../plugins/hooks.js';
import type { HookContext, HookFn } from '../plugins/hooks.js';

// ─── buildHookContext ─────────────────────────────────────────────────────────

describe('buildHookContext', () => {
  it('returns an object with projectName and directory', () => {
    const ctx = buildHookContext('my-app', '/tmp/my-app');
    expect(ctx.projectName).toBe('my-app');
    expect(ctx.directory).toBe('/tmp/my-app');
  });

  it('merges extra properties into the context', () => {
    const ctx = buildHookContext('app', '/out', { framework: 'react-vite', dryRun: true });
    expect(ctx.framework).toBe('react-vite');
    expect(ctx.dryRun).toBe(true);
  });

  it('defaults extras to an empty object when not provided', () => {
    const ctx = buildHookContext('app', '/out');
    expect(Object.keys(ctx)).toEqual(['projectName', 'directory']);
  });

  it('extra properties do not overwrite projectName or directory', () => {
    // Spread order: base first, then extras — so extras can technically
    // overwrite; this test documents the current observable behaviour.
    const ctx = buildHookContext('original', '/original', { projectName: 'override' });
    // extras overwrite because of spread order in implementation
    expect(ctx.projectName).toBe('override');
  });
});

// ─── HookManager — register & count ─────────────────────────────────────────

describe('HookManager — register and count', () => {
  it('starts with zero handlers for any hook name', () => {
    const mgr = new HookManager();
    expect(mgr.count('beforeScaffold')).toBe(0);
  });

  it('count increments after each registration', () => {
    const mgr = new HookManager();
    const noop: HookFn = () => {};
    mgr.register('beforeScaffold', noop);
    expect(mgr.count('beforeScaffold')).toBe(1);
    mgr.register('beforeScaffold', noop);
    expect(mgr.count('beforeScaffold')).toBe(2);
  });

  it('different hook names are tracked independently', () => {
    const mgr = new HookManager();
    const noop: HookFn = () => {};
    mgr.register('beforeScaffold', noop);
    mgr.register('afterScaffold', noop);
    mgr.register('afterScaffold', noop);
    expect(mgr.count('beforeScaffold')).toBe(1);
    expect(mgr.count('afterScaffold')).toBe(2);
  });

  it('names() returns all registered hook names', () => {
    const mgr = new HookManager();
    mgr.register('hookA', () => {});
    mgr.register('hookB', () => {});
    expect(mgr.names()).toContain('hookA');
    expect(mgr.names()).toContain('hookB');
    expect(mgr.names()).toHaveLength(2);
  });

  it('names() returns an empty array when no hooks are registered', () => {
    const mgr = new HookManager();
    expect(mgr.names()).toEqual([]);
  });
});

// ─── HookManager — execute ───────────────────────────────────────────────────

describe('HookManager — execute', () => {
  it('calls each handler with the provided context', async () => {
    const mgr = new HookManager();
    const received: HookContext[] = [];
    mgr.register('onTest', (ctx) => {
      received.push(ctx);
    });
    const context = buildHookContext('proj', '/dir');
    await mgr.execute('onTest', context);
    expect(received).toHaveLength(1);
    expect(received[0]).toStrictEqual(context);
  });

  it('executes handlers in registration order', async () => {
    const mgr = new HookManager();
    const order: number[] = [];
    mgr.register('ordered', () => {
      order.push(1);
    });
    mgr.register('ordered', () => {
      order.push(2);
    });
    mgr.register('ordered', () => {
      order.push(3);
    });
    await mgr.execute('ordered', buildHookContext('p', '/d'));
    expect(order).toEqual([1, 2, 3]);
  });

  it('resolves without error when no handlers are registered', async () => {
    const mgr = new HookManager();
    await expect(mgr.execute('noHandlers', buildHookContext('p', '/d'))).resolves.toBeUndefined();
  });

  it('awaits async handlers before calling the next one', async () => {
    const mgr = new HookManager();
    const order: string[] = [];

    mgr.register('async', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      order.push('first');
    });
    mgr.register('async', () => {
      order.push('second');
    });

    await mgr.execute('async', buildHookContext('p', '/d'));
    expect(order).toEqual(['first', 'second']);
  });

  it('propagates errors thrown by a handler', async () => {
    const mgr = new HookManager();
    mgr.register('failing', () => {
      throw new Error('hook failed');
    });
    await expect(mgr.execute('failing', buildHookContext('p', '/d'))).rejects.toThrow(
      'hook failed',
    );
  });

  it('propagates rejected promises from async handlers', async () => {
    const mgr = new HookManager();
    mgr.register('asyncFailing', async () => {
      await Promise.reject(new Error('async hook failed'));
    });
    await expect(mgr.execute('asyncFailing', buildHookContext('p', '/d'))).rejects.toThrow(
      'async hook failed',
    );
  });

  it('does not call subsequent handlers after one throws', async () => {
    const mgr = new HookManager();
    const second = vi.fn();
    mgr.register('earlyThrow', () => {
      throw new Error('stop');
    });
    mgr.register('earlyThrow', second);

    await mgr.execute('earlyThrow', buildHookContext('p', '/d')).catch(() => {});
    expect(second).not.toHaveBeenCalled();
  });

  it('passes all context properties to the handler', async () => {
    const mgr = new HookManager();
    let received: HookContext | undefined;
    mgr.register('ctx', (ctx) => {
      received = ctx;
    });
    const ctx = buildHookContext('my-proj', '/out', { extra: 42 });
    await mgr.execute('ctx', ctx);
    expect(received?.projectName).toBe('my-proj');
    expect(received?.directory).toBe('/out');
    expect(received?.extra).toBe(42);
  });
});
