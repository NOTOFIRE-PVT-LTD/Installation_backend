import fs from 'fs';
import path from 'path';

const dir = path.resolve('src/services');
const prefixes = ['dashboard', 'stock', 'visit', 'project', 'bom'];
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js') && prefixes.some((p) => f.startsWith(`${p}.`)) && !f.endsWith('.service.js'));

for (const file of files) {
  const fp = path.join(dir, file);
  let text = fs.readFileSync(fp, 'utf8');
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const fn = line.match(/^(?:async )?function (\w+)/);
    const cn = line.match(/^const (\w+) =/);
    const lt = line.match(/^let (\w+) =/);
    if (fn) names.push(fn[1]);
    else if (cn && !line.includes('require(')) names.push(cn[1]);
    else if (lt) names.push(lt[1]);
  }
  const unique = [...new Set(names)];
  text = text.replace(/module\.exports\s*=\s*\{[\s\S]*?\n\};\s*$/, '');
  text = `${text.trimEnd()}\n\nmodule.exports = {\n  ${unique.join(',\n  ')},\n};\n`;
  fs.writeFileSync(fp, text);
  console.log(file, unique.length, 'exports');
}