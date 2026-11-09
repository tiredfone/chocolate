import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(CH, 'content');
const index = {};
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full).split(path.sep).join('/');
      index[rel.toLowerCase()] = rel;
    }
  }
};
walk(root);
fs.writeFileSync(path.join(CH, 'client/content-index.json'), JSON.stringify(index));
console.log('indexed', Object.keys(index).length, 'content files');
