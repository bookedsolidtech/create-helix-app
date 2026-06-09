import { describe, it, expect, vi } from 'vitest';
import { HookManager, buildHookContext } from '../../src/plugins/hooks.js';

describe('HookManager — registration', () => {
  it('starts with zero hooks for any name', () => {
    const manager = new HookManager();
    expect(manager.count('pre-scaffold')).toBe(0);
  });

  it('increments count for the registered lifecycle', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    manager.register('pre-scaffold', vi.fn());
    expect(manager.count('pre-scaffold')).toBe(2);
  });

  it('count is independent per lifecycle', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    manager.register('post-scaffold', vi.fn());
    expect(manager.count('pre-scaffold')).toBe(1);
    expect(manager.count('post-scaffold')).toBe(1);
    expect(manager.count('pre-write')).toBe(0);
  });

  it('names() returns empty array when no hooks registered', () => {
    const manager = new HookManager();
    expect(manager.names()).toEqual([]);
  });

  it('names() returns all registered hook names', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    manager.register('post-write', vi.fn());
    const names = manager.names();
    expect(names).toContain('pre-scaffold');
    expect(names).toContain('post-write');
    expect(names).toHaveLength(2);
  });

  it('names() does not include duplicates for same lifecycle', () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', vi.fn());
    manager.register('pre-scaffold', vi.fn());
    expect(manager.names()).toEqual(['pre-scaffold']);
  });
});

describe('HookManager — execute', () => {
  it('fires pre-scaffold hook with context', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-scaffold', hook);
    const ctx = buildHookContext('test-app', '/tmp/test-app');
    await manager.execute('pre-scaffold', ctx);
    expect(hook).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledWith(ctx);
  });

  it('fires post-scaffold hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('post-scaffold', hook);
    await manager.execute('post-scaffold', buildHookContext('test-app', '/tmp/test-app'));
    expect(hook).toHaveBeenCalledOnce();
  });

  it('fires pre-write hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-write', hook);
    await manager.execute('pre-write', buildHookContext('test-app', '/tmp/test-app'));
    expect(hook).toHaveBeenCalledOnce();
  });

  it('fires post-write hook', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('post-write', hook);
    await manager.execute('post-write', buildHookContext('test-app', '/tmp/test-app'));
    expect(hook).toHaveBeenCalledOnce();
  });

  it('does not fire hooks registered for a different lifecycle', async () => {
    const manager = new HookManager();
    const hook = vi.fn();
    manager.register('pre-scaffold', hook);
    await manager.execute('post-scaffold', buildHookContext('test-app', '/tmp/test-app'));
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
    await manager.execute('pre-scaffold', buildHookContext('test-app', '/tmp/test-app'));
    expect(order).toEqual([1, 2, 3]);
  });

  it('does nothing when no hooks registered for lifecycle', async () => {
    const manager = new HookManager();
    await expect(
      manager.execute('pre-scaffold', buildHookContext('test-app', '/tmp/test-app')),
    ).resolves.toBeUndefined();
  });

  it('awaits async hooks before calling next', async () => {
    const order: string[] = [];
    const manager = new HookManager();
    manager.register('pre-scaffold', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('first');
    });
    manager.register('pre-scaffold', () => {
      order.push('second');
    });
    await manager.execute('pre-scaffold', buildHookContext('test-app', '/tmp/test-app'));
    expect(order).toEqual(['first', 'second']);
  });

  it('throws when a hook throws', async () => {
    const manager = new HookManager();
    manager.register('pre-scaffold', () => {
      throw new Error('hook failed intentionally');
    });
    await expect(
      manager.execute('pre-scaffold', buildHookContext('test-app', '/tmp/test-app')),
    ).rejects.toThrow('hook failed intentionally');
  });

  it('stops executing subsequent hooks after one throws', async () => {
    const manager = new HookManager();
    const secondHook = vi.fn();
    manager.register('pre-scaffold', () => {
      throw new Error('abort!');
    });
    manager.register('pre-scaffold', secondHook);
    await expect(
      manager.execute('pre-scaffold', buildHookContext('test-app', '/tmp/test-app')),
    ).rejects.toThrow();
    expect(secondHook).not.toHaveBeenCalled();
  });
});

describe('buildHookContext', () => {
  it('creates context with projectName and directory', () => {
    const ctx = buildHookContext('my-app', '/tmp/my-app');
    expect(ctx.projectName).toBe('my-app');
    expect(ctx.directory).toBe('/tmp/my-app');
  });

  it('spreads extras into the context', () => {
    const ctx = buildHookContext('my-app', '/tmp/my-app', { template: 'react-next', foo: 42 });
    expect(ctx.template).toBe('react-next');
    expect(ctx.foo).toBe(42);
  });

  it('extras default to empty object when not provided', () => {
    const ctx = buildHookContext('my-app', '/tmp/my-app');
    expect(Object.keys(ctx)).toEqual(['projectName', 'directory']);
  });

  it('extras can override projectName and directory', () => {
    const ctx = buildHookContext('my-app', '/tmp/my-app', { projectName: 'overridden' });
    expect(ctx.projectName).toBe('overridden');
  });
});
