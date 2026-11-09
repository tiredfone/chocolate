import fs from 'fs/promises';
import { parsePlace } from '../shared/rbxl.js';
import { config, siteUrl } from './config.js';

const ASSET_DIR = config.assetDir;
const cache = new Map();
const MAX_BYTES = 32 * 1024 * 1024;

export function assetIdOf(url) {
  if (typeof url === 'number') return url > 0 ? url : null;
  const m = /[?&]id=(\d+)/i.exec(String(url || ''));
  if (m) return +m[1];
  if (/^\d+$/.test(String(url || '').trim())) return +String(url).trim();
  return null;
}

async function httpGet(url, timeoutMs = 15000) {
  if (!url) throw new Error('endpoint not configured');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': config.userAgent || 'Chocolate/0.1' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('asset too large');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

export async function assetBytes(id) {
  id = assetIdOf(id);
  if (!id) throw new Error('bad asset id');
  const hit = cache.get(id);
  if (hit) return hit;
  const p = (async () => {
    if (ASSET_DIR) {
      try {
        const st = await fs.stat(`${ASSET_DIR}/${id}`);
        if (st.size > MAX_BYTES) throw new Error('asset too large');
        return new Uint8Array(await fs.readFile(`${ASSET_DIR}/${id}`));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    return httpGet(siteUrl('asset', id));
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return p;
}

export async function assetNodes(id) {
  const bytes = await assetBytes(id);
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (!head.startsWith('<roblox')) throw new Error('asset is not a model');
  return parsePlace(bytes);
}

export async function placeBytes(placeId) {
  const id = assetIdOf(placeId);
  if (!id) throw new Error('bad place id');
  if (ASSET_DIR) {
    const st = await fs.stat(`${ASSET_DIR}/${id}`);
    if (st.size > 64 * 1024 * 1024) throw new Error('place too large');
    return new Uint8Array(await fs.readFile(`${ASSET_DIR}/${id}`));
  }
  const url = siteUrl('place', id);
  if (!url) throw new Error('set assetDir or endpoints.place in config.local.php');
  return httpGet(url, 30000);
}

export async function luaSource(id) {
  id = id | 0;
  if (id <= 0) return null;
  let src = null;
  if (ASSET_DIR) {
    try {
      src = await fs.readFile(`${ASSET_DIR}/${id}.lua`, 'utf8');
    } catch {}
  }
  if (src === null) {
    try {
      src = await siteText(siteUrl('coreScript', id));
    } catch {
      return null;
    }
  }
  if (src.startsWith('\uFEFF')) src = src.slice(1);
  if (src.startsWith('%')) src = src.slice(src.indexOf('\n') + 1);
  if (src.startsWith('<')) return null;
  return src;
}

export async function siteText(url) {
  const b = await httpGet(url);
  return new TextDecoder().decode(b);
}

export async function siteJson(path) {
  return JSON.parse(await siteText(path));
}

async function retryText(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await siteText(url);
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

export async function appearance(userId) {
  const out = { colors: null, assets: [], gear: [] };
  let list = '';
  try {
    list = await retryText(siteUrl('appearance', userId));
  } catch {
    return out;
  }
  const urls = list.split(';').map((s) => s.trim()).filter(Boolean);
  for (const u of urls) {
    if (/BodyColors/i.test(u)) {
      try {
        const xml = await retryText(siteUrl('bodyColors', userId));
        out.colors = parsePlace(xml);
      } catch {}
      continue;
    }
    const id = assetIdOf(u);
    if (id) out.assets.push(id);
  }
  const gearUrl = siteUrl('gears', userId);
  if (gearUrl) {
    try {
      const g = await retryText(gearUrl);
      out.gear = [...g.matchAll(/\d+/g)].map((m) => +m[0]).filter((n) => n > 0);
    } catch {}
  }
  return out;
}
