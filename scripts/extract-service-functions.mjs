/**
 * Extract top-level functions/const/let blocks from a service into a map.
 * Dry-run: node scripts/extract-service-functions.mjs src/services/dashboard.service.js
 */
import fs from 'fs';
import path from 'path';

const file = path.resolve(process.argv[2] || 'src/services/dashboard.service.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

const exportIdx = lines.findIndex((l) => /^module\.exports\s*=/.test(l));
const bodyLines = exportIdx >= 0 ? lines.slice(0, exportIdx) : lines;

let header = [];
let i = 0;
while (i < bodyLines.length) {
  const line = bodyLines[i];
  if (/^(async )?function \w+/.test(line) || /^const \w+ =/.test(line) || /^let \w+ =/.test(line)) break;
  header.push(line);
  i++;
}

const units = [];
while (i < bodyLines.length) {
  const line = bodyLines[i];
  const m = line.match(/^(async )?function (\w+)|^const (\w+) =|^let (\w+) =/);
  if (!m) {
    i++;
    continue;
  }
  const name = m[2] || m[3] || m[4];
  let depth = 0;
  let started = false;
  const start = i;
  for (let j = i; j < bodyLines.length; j++) {
    for (const ch of bodyLines[j]) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') depth--;
    }
    if (started && depth === 0) {
      const text = bodyLines.slice(start, j + 1).join('\n');
      units.push({ name, lines: j - start + 1, text });
      i = j + 1;
      break;
    }
    if (j === bodyLines.length - 1) {
      units.push({ name, lines: j - start + 1, text: bodyLines.slice(start, j + 1).join('\n') });
      i = j + 1;
    }
  }
}

const exportBlock = exportIdx >= 0 ? lines.slice(exportIdx).join('\n') : '';
const exportNames = exportBlock
  ? [...exportBlock.matchAll(/^\s*(\w+)\s*,?\s*$/gm)].map((x) => x[1]).filter((n) => n !== 'module')
  : [];

console.log(
  JSON.stringify(
    {
      file,
      headerLines: header.length,
      unitCount: units.length,
      exportNames,
      longUnits: units.filter((u) => u.lines > 30).map((u) => ({ name: u.name, lines: u.lines })),
    },
    null,
    2
  )
);