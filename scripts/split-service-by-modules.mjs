/**
 * Splits a CommonJS service file into sibling modules + thin facade.
 * Groups top-level functions/consts into files ≤ maxFileLines (default 240).
 * Usage: node scripts/split-service-by-modules.mjs src/services/dashboard.service.js
 */
import fs from 'fs';
import path from 'path';

const maxFileLines = Number(process.env.MAX_FILE_LINES || 240);

const servicePath = process.argv[2];
if (!servicePath) {
  console.error('Usage: node split-service-by-modules.mjs <path/to/foo.service.js>');
  process.exit(1);
}

const absPath = path.resolve(servicePath);
const src = fs.readFileSync(absPath, 'utf8');
const lines = src.split(/\r?\n/);

const exportsMatch = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\};\s*$/);
if (!exportsMatch) {
  console.error('No module.exports block found');
  process.exit(1);
}

const exportNames = [...exportsMatch[1].matchAll(/^\s*(\w+)\s*,?\s*$/gm)].map((m) => m[1]);
const exportBlockStart = src.lastIndexOf('module.exports');

function sliceLineRange(start, end) {
  return lines.slice(start, end + 1).join('\n');
}

function parseTopLevelUnits(beforeExports) {
  const units = [];
  let i = 0;
  while (i < beforeExports.length) {
    const line = beforeExports[i];
    const fn = line.match(/^(async )?function (\w+)\s*\(/);
    const cnst = line.match(/^const (\w+)\s*=/);
    const letm = line.match(/^let (\w+)\s*=/);
    if (fn || cnst || letm) {
      const name = fn ? fn[2] : cnst ? cnst[1] : letm[1];
      let depth = 0;
      let started = false;
      const start = i;
      for (let j = i; j < beforeExports.length; j++) {
        const l = beforeExports[j];
        for (const ch of l) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') depth--;
        }
        if (started && depth === 0) {
          units.push({ name, start, end: j, kind: fn ? 'function' : 'decl' });
          i = j + 1;
          break;
        }
        if (j === beforeExports.length - 1) {
          units.push({ name, start, end: j, kind: fn ? 'function' : 'decl' });
          i = j + 1;
        }
      }
      continue;
    }
    if (line.trim().startsWith('/**') || (line.trim() && !line.trim().startsWith('//'))) {
      const start = i;
      while (i < beforeExports.length && beforeExports[i].trim() !== '') i++;
      if (i > start) units.push({ name: `_block_${start}`, start, end: i - 1, kind: 'misc' });
      continue;
    }
    i++;
  }
  return units;
}

const beforeExportLines = lines.slice(0, lines.findIndex((l) => l.includes('module.exports')));
const headerEnd = beforeExportLines.findIndex((l, idx) => {
  const next = beforeExportLines[idx];
  return /^(async )?function |^const \w+ =|^let \w+ =/.test(next);
});
const header =
  headerEnd > 0 ? beforeExportLines.slice(0, headerEnd).join('\n').trimEnd() : beforeExportLines.join('\n');

const units = parseTopLevelUnits(beforeExportLines);

function unitLines(u) {
  return u.end - u.start + 1;
}

function unitText(u) {
  return sliceLineRange(u.start, u.end);
}

function refsIn(text, names) {
  return names.filter((n) => text.includes(n) && !text.match(new RegExp(`function ${n}\\s*\\(`)));
}

const unitNames = units.map((u) => u.name).filter((n) => !n.startsWith('_block_'));
const deps = new Map();
units.forEach((u) => {
  if (u.name.startsWith('_block_')) return;
  const text = unitText(u);
  deps.set(u.name, refsIn(text, unitNames.filter((n) => n !== u.name)));
});

const baseName = path.basename(absPath, '.js');
const siblingPrefix = baseName.replace(/\.service$/, '');
const outDir = path.dirname(absPath);

const bins = [];
let current = { units: [], lines: 0, names: new Set() };

function flushBin() {
  if (!current.units.length) return;
  bins.push(current);
  current = { units: [], lines: 0, names: new Set() };
}

function estimateBinLines(bin) {
  return bin.lines + header.split('\n').length + 12;
}

for (const u of units) {
  const len = unitLines(u);
  const needed = len + (current.units.length ? 1 : 0);
  if (current.units.length && estimateBinLines({ ...current, lines: current.lines + needed }) > maxFileLines) {
    flushBin();
  }
  current.units.push(u);
  current.lines += needed;
  if (!u.name.startsWith('_block_')) current.names.add(u.name);
}
flushBin();

const created = [];
bins.forEach((bin, idx) => {
  const exportedHere = exportNames.filter((n) => bin.names.has(n));
  const suffix =
    exportedHere.length === 1
      ? exportedHere[0]
      : exportedHere.length > 1
        ? exportedHere.slice(0, 2).join('_')
        : `helpers${idx + 1}`;
  const fileName = `${siblingPrefix}.${suffix}.js`;
  const filePath = path.join(outDir, fileName);

  const body = bin.units.map((u) => unitText(u)).join('\n\n');
  const moduleImports = new Set();
  const localNames = [...bin.names];
  bins.forEach((other, otherIdx) => {
    if (otherIdx === idx) return;
    const otherExports = exportNames.filter((n) => other.names.has(n));
    const need = new Set();
    localNames.forEach((n) => {
      deps.get(n)?.forEach((d) => {
        if (other.names.has(d)) need.add(d);
      });
    });
    otherExports.forEach((n) => {
      localNames.forEach((fn) => {
        if (unitText(units.find((u) => u.name === fn)).includes(n)) need.add(n);
      });
    });
    if (need.size) {
      const mod = `${siblingPrefix}.${otherExports.length === 1 ? otherExports[0] : `helpers${otherIdx + 1}`}.js`;
      moduleImports.add(`const { ${[...need].join(', ')} } = require('./${path.basename(mod, '.js')}');`);
    }
  });

  const chunk =
    `${header}\n\n${[...moduleImports].join('\n')}${moduleImports.size ? '\n\n' : ''}${body}\n`;
  fs.writeFileSync(filePath, chunk);
  created.push({ filePath, lineCount: chunk.split('\n').length, exports: exportedHere });
});

const facadeImports = created
  .filter((c) => c.exports.length)
  .map((c) => {
    const req = `./${path.basename(c.filePath, '.js')}`;
    return `const { ${c.exports.join(', ')} } = require('${req}');`;
  })
  .join('\n');

const facade = `${facadeImports}

module.exports = {
  ${exportNames.map((n) => n).join(',\n  ')},
};
`;

fs.writeFileSync(absPath, facade);
console.log(JSON.stringify({ facade: absPath, facadeLines: facade.split('\n').length, created }, null, 2));