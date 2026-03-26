import { readFileSync, writeFileSync } from 'fs';

const file = 'dist/index.js';
const shebang = '#!/usr/bin/env node\n';
const content = readFileSync(file, 'utf8');

if (!content.startsWith(shebang)) {
  writeFileSync(file, shebang + content);
}
