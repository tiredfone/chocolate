import { builtin, contentUrl, loadImage } from './assets.js';

const resolved = new Map();
const MAX = 128;

export const CURSORS = {
  arrow: 'rbxasset://textures/ArrowCursor.png',
  far: 'rbxasset://textures/ArrowFarCursor.png',
  hand: 'rbxasset://textures/DragCursor.png',
};

function fromImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalWidth <= MAX && img.naturalHeight <= MAX ? { src, w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function fromAsset(url) {
  const bmp = await loadImage(url);
  if (!bmp) return null;
  let w = bmp.width, h = bmp.height;
  const k = Math.min(1, MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.translate(0, h);
  g.scale(1, -1);
  g.drawImage(bmp, 0, 0, w, h);
  return { src: c.toDataURL('image/png'), w, h };
}

export function resolveCursor(url) {
  const key = String(url || '').trim();
  if (!key) return Promise.resolve(null);
  let p = resolved.get(key);
  if (!p) {
    const b = builtin(key);
    p = (b ? fromImage(contentUrl(b)) : fromAsset(key)).catch(() => null);
    resolved.set(key, p);
  }
  return p;
}

export class CursorLayer {
  constructor(target, fallback = 'default') {
    this.target = target;
    this.fallback = fallback;
    this.want = null;
    this.current = null;
    this.x = 0;
    this.y = 0;
    this.overlay = document.createElement('img');
    this.overlay.alt = '';
    this.overlay.draggable = false;
    this.overlay.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483646;display:none;image-rendering:pixelated';
    document.body.appendChild(this.overlay);
    window.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement) return;
      this.x = e.clientX;
      this.y = e.clientY;
    }, true);
    document.addEventListener('pointerlockchange', () => this.place());
  }

  set(url) {
    if (url === this.want) return;
    this.want = url;
    resolveCursor(url).then((c) => {
      if (this.want !== url) return;
      this.current = c;
      this.target.style.cursor = c ? `url("${c.src}") ${c.w >> 1} ${c.h >> 1}, ${this.fallback}` : this.fallback;
      if (c) this.overlay.src = c.src;
      this.place();
    });
  }

  place(center = false) {
    const c = this.current;
    const locked = document.pointerLockElement === this.target;
    if (!c || !locked) {
      this.overlay.style.display = 'none';
      return;
    }
    let x = this.x, y = this.y;
    if (center) {
      const r = this.target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    this.overlay.style.width = c.w + 'px';
    this.overlay.style.height = c.h + 'px';
    this.overlay.style.transform = `translate(${Math.round(x - c.w / 2)}px, ${Math.round(y - c.h / 2)}px)`;
    this.overlay.style.display = 'block';
  }
}
