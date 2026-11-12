import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(CH, 'corescripts2018');
const out = {};
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.lua')) out[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
  }
};
walk(path.join(root, 'CoreScriptsRoot'));
walk(path.join(root, 'PlayerScripts'));
fs.writeFileSync(path.join(root, 'bundle.json'), JSON.stringify(out));
console.log('corescripts2018/bundle.json:', Object.keys(out).length, 'scripts');
