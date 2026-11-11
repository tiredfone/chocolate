import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  try {
    const out = execFileSync(process.env.CHOCOLATE_PHP || 'php', ['-r', 'echo json_encode(require $argv[1]);', path.join(ROOT, 'config.php')], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    process.stderr.write(`could not read config.php: ${e.message}\n`);
    process.exit(1);
  }
}

const cfg = load();
const env = process.env;
if (env.CHOCOLATE_HOST) cfg.host = env.CHOCOLATE_HOST;
if (env.CHOCOLATE_PORT) cfg.port = +env.CHOCOLATE_PORT;
if (env.CHOCOLATE_SITE) cfg.siteUrl = env.CHOCOLATE_SITE;
if (env.CHOCOLATE_KEY) cfg.key = env.CHOCOLATE_KEY;
if (env.CHOCOLATE_ASSET_DIR) cfg.assetDir = env.CHOCOLATE_ASSET_DIR;
cfg.endpoints = cfg.endpoints || {};
cfg.siteUrl = String(cfg.siteUrl || '').replace(/\/+$/, '');
cfg.assetDir = cfg.assetDir ? String(cfg.assetDir).replace(/\/+$/, '') : '';

export const config = cfg;

export function endpoint(name, id) {
  const t = cfg.endpoints[name];
  if (!t) return null;
  return String(t).replace(/\{id\}/g, String(Number.isSafeInteger(Number(id)) && Number(id) > 0 ? Number(id) : 0));
}

export function siteUrl(name, id) {
  const p = endpoint(name, id);
  if (!p) return null;
  return /^https?:\/\//i.test(p) ? p : cfg.siteUrl + p;
}
