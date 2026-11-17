import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const root = path.resolve('src/services');
const files = [
  ...globSync('**/*.service.js', { cwd: root, absolute: true }),
  ...globSync('**/*.{js}', { cwd: root, absolute: true }).filter(
    (f) => !f.endsWith('.service.js') && path.basename(f).includes('.')
  ),
];

const violations = { files: [], functions: [] };

function measureFunctions(text) {
  const lines = text.split(/\r?\n/);
  const long = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(async )?function (\w+)/);
    if (!m) {
      i++;
      continue;
    }
    const name = m[2];
    let depth = 0;
    let started = false;
    const start = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') depth--;
      }
      if (started && depth === 0) {
        const len = j - start + 1;
        if (len > 30) long.push({ name, lines: len, start: start + 1 });
        i = j + 1;
        break;
      }
    }
  }
  return long;
}

for (const file of files) {
  if (file.includes('scripts')) continue;
  const base = path.basename(file);
  if (!base.startsWith('dashboard.') && !base.startsWith('stock.') && !base.startsWith('visit.') && !base.startsWith('project.') && !base.startsWith('bom.') && !base.endsWith('.service.js')) {
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const lineCount = text.split(/\r?\n/).length;
  if (lineCount > 250) violations.files.push({ file: path.relative(root, file), lines: lineCount });
  measureFunctions(text).forEach((fn) =>
    violations.functions.push({ file: path.relative(root, file), ...fn })
  );
}

console.log(JSON.stringify(violations, null, 2));