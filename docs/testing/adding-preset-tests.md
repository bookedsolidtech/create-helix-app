# Adding Tests for a New Drupal Preset

When a new Drupal preset is added to `create-helix`, follow these steps.

## 1. Define SDCs in `src/presets/loader.ts`

Add an array of SDC machine names for your preset. If your preset extends an existing one, spread the parent SDC list:

```typescript
const MY_PRESET_SDCS: string[] = [
  ...STANDARD_SDCS, // inherit standard SDCs if applicable
  'my-new-component',
  'another-component',
];
```

## 2. Add the preset to `PRESETS` array

```typescript
{
  id: 'my-preset',
  label: 'My Preset',
  sdcList: MY_PRESET_SDCS,
  dependencies: {
    '@helixui/drupal-starter': '^1.0.0',
    '@helixui/tokens': '^0.3.0',
  },
  architectureNotes: 'Description of this preset and its use case.',
}
```

## 3. Add the preset ID to `VALID_PRESETS`

```typescript
export const VALID_PRESETS = ['standard', 'blog', 'healthcare', 'intranet', 'my-preset'] as const;
```

## 4. Update the `DrupalPreset` type in `src/types.ts`

```typescript
export type DrupalPreset = 'standard' | 'blog' | 'healthcare' | 'intranet' | 'my-preset';
```

## 5. Add tests in `src/__tests__/presets.test.ts`

```typescript
it('my-preset includes expected SDCs', () => {
  const myPreset = getPreset('my-preset');
  expect(myPreset.sdcList).toContain('my-new-component');
  expect(myPreset.sdcList).toContain('another-component');
});

it('my-preset inherits standard SDCs', () => {
  const myPreset = getPreset('my-preset');
  expect(myPreset.sdcList).toContain('node-teaser');
  expect(myPreset.sdcList).toContain('hero-banner');
});
```

## 6. Add Drupal theme scaffold tests in `src/__tests__/drupal-presets.test.ts`

```typescript
it('my-preset SDCs are all present as component directories', async () => {
  const dir = path.join(TMP, 'my-preset-sdcs');
  await scaffoldDrupalTheme({
    themeName: 'test_my_preset',
    directory: dir,
    preset: 'my-preset',
  });

  const componentsDir = path.join(dir, 'src', 'components');
  const sdcDirs = fs.readdirSync(componentsDir);
  expect(sdcDirs).toContain('my-new-component');
  expect(sdcDirs).toContain('another-component');
});
```

## 7. Run tests

```bash
pnpm test -- src/__tests__/presets.test.ts src/__tests__/drupal-presets.test.ts --reporter=verbose
```
