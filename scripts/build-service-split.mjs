import fs from 'fs';
import path from 'path';

const maxFile = Number(process.env.MAX_FILE_LINES || 235);
const file = path.resolve(process.argv[2]);
const dryRun = process.argv.includes('--dry-run');

const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);
const exportIdx = lines.findIndex((l) => /^module\.exports\s*=/.test(l));
const bodyLines = lines.slice(0, exportIdx);

const exportBlock = lines.slice(exportIdx).join('\n');
const exported = [...exportBlock.matchAll(/^\s*(\w+)\s*,?\s*$/gm)]
  .map((m) => m[1])
  .filter((n) => !['module', 'exports'].includes(n));

function isUnitStart(line) {
  return /^(async )?function \w+/.test(line) || /^let \w+ =/.test(line);
}

const firstUnitIdx = bodyLines.findIndex((line) => isUnitStart(line));
const header = firstUnitIdx >= 0 ? bodyLines.slice(0, firstUnitIdx) : [...bodyLines];
const headerNames = new Set(
  header
    .map((line) => line.match(/^const (\w+) =|^let (\w+) =/))
    .filter(Boolean)
    .map((m) => m[1] || m[2])
);
let i = firstUnitIdx >= 0 ? firstUnitIdx : bodyLines.length;

const units = [];
while (i < bodyLines.length) {
  if (!isUnitStart(bodyLines[i])) {
    i++;
    continue;
  }
  const letLine = bodyLines[i].match(/^let (\w+) =/);
  if (letLine) {
    const name = letLine[1];
    const start = i;
    let end = i;
    if (!bodyLines[i].includes('{')) {
      end = i;
    } else {
      let depth = 0;
      let started = false;
      for (let j = i; j < bodyLines.length; j++) {
        for (const ch of bodyLines[j]) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') depth--;
        }
        if (started && depth === 0) {
          end = j;
          break;
        }
      }
    }
    units.push({
      name,
      lines: end - start + 1,
      text: bodyLines.slice(start, end + 1).join('\n'),
    });
    i = end + 1;
    continue;
  }
  const name = bodyLines[i].match(/^(?:async )?function (\w+)/)[1];
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
      units.push({
        name,
        lines: j - start + 1,
        text: bodyLines.slice(start, j + 1).join('\n'),
      });
      i = j + 1;
      break;
    }
  }
}

// Also capture top-level const/let between functions (e.g. MATERIAL_SLICE_META)
const constUnits = [];
const seenUnitNames = new Set();
const constRegex = /^const (\w+) =/;
for (let k = i; k < bodyLines.length; k++) {
  if (constRegex.test(bodyLines[k]) && !bodyLines[k].includes('require(')) {
    const name = bodyLines[k].match(constRegex)[1];
    if (headerNames.has(name) || seenUnitNames.has(name) || units.some((u) => u.name === name)) continue;
    let depth = 0;
    let started = false;
    const start = k;
    for (let j = k; j < bodyLines.length; j++) {
      for (const ch of bodyLines[j]) {
        if (ch === '[' || ch === '{') {
          depth++;
          started = true;
        } else if (ch === ']' || ch === '}') depth--;
      }
      if (started && depth === 0 && j > start) {
        constUnits.push({
          name,
          lines: j - start + 1,
          text: bodyLines.slice(start, j + 1).join('\n'),
        });
        seenUnitNames.add(name);
        break;
      }
      if (j === bodyLines.length - 1) {
        constUnits.push({ name, lines: j - start + 1, text: bodyLines.slice(start, j + 1).join('\n') });
      }
    }
  }
}

const allUnits = [...constUnits, ...units];
const unitNames = allUnits.map((u) => u.name);

function dependencies(text) {
  const set = new Set();
  unitNames.forEach((n) => {
    if (new RegExp(`\\b${n}\\b`).test(text) && !new RegExp(`function ${n}\\s*\\(`).test(text)) set.add(n);
  });
  return [...set];
}

const deps = new Map(allUnits.map((u) => [u.name, dependencies(u.text)]));

const base = path.basename(file, '.js');
const prefix = base.replace(/\.service$/, '');
const dir = path.dirname(file);

const bins = [];
let bin = { items: [], lineCount: 0, names: new Set() };

function binFileName(b, index) {
  const exportedNames = exported.filter((n) => b.names.has(n));
  if (exportedNames.length === 1) return `${prefix}.${exportedNames[0]}.js`;
  if (exportedNames.length > 1) return `${prefix}.${exportedNames.join('And')}.js`;
  const first = b.items[0]?.name || `part${index}`;
  return `${prefix}.${first}Helpers.js`;
}

function flush() {
  if (bin.items.length) bins.push(bin);
  bin = { items: [], lineCount: 0, names: new Set() };
}

const headerLines = header.join('\n').split('\n').length + 8;

for (const u of allUnits) {
  const addLines = u.lines + 2;
  if (bin.items.length && bin.lineCount + addLines + headerLines > maxFile) flush();
  bin.items.push(u);
  bin.lineCount += addLines;
  bin.names.add(u.name);
}
flush();

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        file,
        units: allUnits.length,
        bins: bins.map((b, idx) => ({
          file: binFileName(b, idx),
          lines: b.lineCount + headerLines,
          names: [...b.names],
          exported: exported.filter((n) => b.names.has(n)),
        })),
      },
      null,
      2
    )
  );
  process.exit(0);
}

const written = [];
bins.forEach((b, idx) => {
  const fileName = binFileName(b, idx);
  const outPath = path.join(dir, fileName);
  const local = new Set(b.names);
  const imports = [];

  bins.forEach((other, oidx) => {
    if (oidx === idx) return;
    const need = new Set();
    b.items.forEach((u) => {
      deps.get(u.name)?.forEach((d) => {
        if (other.names.has(d) && !local.has(d)) need.add(d);
      });
    });
    if (!need.size) return;
    const otherFile = binFileName(other, oidx);
    imports.push(`const { ${[...need].sort().join(', ')} } = require('./${path.basename(otherFile, '.js')}');`);
  });

  const body = b.items.map((u) => u.text).join('\n\n');
  const exportLines =
    '\nmodule.exports = {\n' + [...b.names].sort().map((n) => `  ${n},`).join('\n') + '\n};\n';

  const content = `${header.join('\n').trimEnd()}\n\n${imports.join('\n')}${imports.length ? '\n\n' : ''}${body}${exportLines}`;
  fs.writeFileSync(outPath, content);
  written.push({ outPath, lines: content.split('\n').length, exports: exportedHere });
});

const facadeReqs = written
  .filter((w) => w.exports.length)
  .map((w) => `const { ${w.exports.join(', ')} } = require('./${path.basename(w.outPath, '.js')}');`)
  .join('\n');

const facade = `${facadeReqs}

module.exports = {
  ${exported.join(',\n  ')},
};
`;

fs.writeFileSync(file, facade);

console.log(
  JSON.stringify(
    {
      facade: file,
      facadeLines: facade.split('\n').length,
      written,
    },
    null,
    2
  )
);