import { config, siteUrl } from './config.js';

export function report(data) {
  return post('report', data);
}

export function social(action, data) {
  return post('social', { action, ...data });
}

async function post(endpointName, body) {
  const url = siteUrl(endpointName);
  const key = String(config.key || '');
  if (!url || !key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': config.userAgent || 'Chocolate/26.12-preview', 'Content-Type': 'application/json', 'X-Chocolate-Key': key },
      body: JSON.stringify(body),
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
