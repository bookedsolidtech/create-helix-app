/**
 * Parses vitest benchmark JSON (`vitest bench --outputJson=<file>`) into a flat
 * Map of "<describe path> > <benchmark name>" -> mean iteration time in ms.
 *
 * Vitest 4 output shape:
 *   { files: [ { filepath, groups: [ { fullName, benchmarks: [ { name, mean } ] } ] } ] }
 *
 * `group.fullName` is "<relative bench file path> > <describe...>"; the leading
 * file-path segment is dropped so the keys match the "<describe> > <name>" form
 * stored in tests/benchmarks/baselines.json.
 *
 * (Vitest 3 emitted `{ testResults: [ { assertionResults: [ { fullName, duration } ] } ] }`
 * via `--reporter=json`; that reporter was removed for bench mode in vitest 4.)
 *
 * @param {unknown} results Parsed contents of the --outputJson file.
 * @returns {Map<string, number>} benchmark key -> mean time (ms)
 */
export function parseBenchResults(results) {
  /** @type {Map<string, number>} */
  const out = new Map();

  if (!results || typeof results !== 'object' || !Array.isArray(results.files)) {
    return out;
  }

  for (const file of results.files) {
    if (!file || !Array.isArray(file.groups)) continue;
    for (const group of file.groups) {
      if (!group || !Array.isArray(group.benchmarks)) continue;
      const describe = groupDescribe(group.fullName);
      for (const bench of group.benchmarks) {
        if (bench && typeof bench.name === 'string' && typeof bench.mean === 'number') {
          const key = describe ? `${describe} > ${bench.name}` : bench.name;
          out.set(key, bench.mean);
        }
      }
    }
  }

  return out;
}

/**
 * Strips the leading bench-file-path segment from a vitest group fullName,
 * leaving the describe-block path: "foo/x.bench.ts > a > b" -> "a > b".
 *
 * @param {unknown} fullName
 * @returns {string}
 */
function groupDescribe(fullName) {
  if (typeof fullName !== 'string') return '';
  return fullName.split(' > ').slice(1).join(' > ');
}
