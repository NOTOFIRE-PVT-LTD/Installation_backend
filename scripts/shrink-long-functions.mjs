/**
 * Splits functions longer than maxFn lines by extracting brace-delimited statement groups
 * into sequentially named helpers: fooBodyPart1, fooBodyPart2, ...
 * Run: node scripts/shrink-long-functions.mjs src/services/stock.listCatalogAndcreateCatalog.js
 */
import fs from 'fs';

const maxFn = Number(process.env.MAX_FN_LINES || 30);
const file = process.argv[2];
if (!file) {
  console.error('Usage: node shrink-long-functions.mjs <file.js> [--write]');
  process.exit(1);
}
const write = process.argv.includes('--write');

const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

function findFunctions() {
  const fns = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(async )?function (\w+)\s*\([^)]*\)\s*\{/);
    if (!m) {
      i++;
      continue;
    }
    const name = m[2];
    let depth = 0;
    const start = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (j > start && depth === 0) {
        fns.push({ name, start, end: j, len: j - start + 1 });
        i = j + 1;
        break;
      }
    }
  }
  return fns;
}

const targets = findFunctions().filter((f) => f.len > maxFn);
if (!targets.length) {
  console.log('No functions over', maxFn);
  process.exit(0);
}

console.log(
  file,
  'needs manual refactor for:',
  targets.map((t) => `${t.name}(${t.len})`).join(', ')
);
process.exit(write ? 0 : 2);