import { config, siteUrl } from './config.js';

export async function social(action, data) {
  const url = siteUrl('social');
  const key = String(config.key || '');
  if (!url || !key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': config.userAgent || 'Chocolate/26.11.3', 'Content-Type': 'application/json', 'X-Chocolate-Key': key },
      body: JSON.stringify({ action, ...data }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
