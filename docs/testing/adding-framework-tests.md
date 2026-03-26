# Adding Tests for a New Framework

When a new framework scaffold is added to `create-helix`, follow these steps to add tests.

## 1. Add the template to `src/templates.ts`

Ensure your new framework has an entry in `TEMPLATES` with:

- `id` — unique string identifier (e.g., `'solid'`)
- `name` — display name
- `description` — short description
- `hint` — one-line hint for the TUI
- `color` — a `picocolors` function
- `dependencies` — runtime npm packages
- `devDependencies` — development npm packages (must include `typescript`)
- `features` — array of feature strings

## 2. Add scaffold logic to `src/scaffold.ts`

Add a `case` to the `switch (options.framework)` block and implement a `scaffoldMyFramework(options)` function that creates framework-specific files.

## 3. Add the framework ID to `src/types.ts`

Add the new framework ID to the `Framework` union type.

## 4. Add tests in `src/__tests__/scaffold.test.ts`

Add a new `describe` block following the existing pattern:

```typescript
describe('scaffoldProject — my-framework', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'my-fw-app', framework: 'my-framework' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'my-framework.config.ts',
      'src/main.ts',
      // ... all generated files
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has correct scripts', async () => {
    const opts = makeOptions({ name: 'my-fw-scripts', framework: 'my-framework' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('my-framework dev');
    expect(pkg.scripts.build).toBe('my-framework build');
  });

  it('includes correct dependencies', async () => {
    const opts = makeOptions({ name: 'my-fw-deps', framework: 'my-framework' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['my-framework']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
  });
});
```

## 5. Update the templates test

In `src/__tests__/templates.test.ts`, add your framework to the `expectedFrameworks` array:

```typescript
const expectedFrameworks: Framework[] = [
  // ... existing frameworks
  'my-framework',
];
```

## 6. Run tests

```bash
pnpm test -- src/__tests__/ --reporter=verbose
```

All tests must pass before pushing.
