import { contentUrl } from './assets.js';

const fonts = new Map();

export function loadFont(name) {
  let p = fonts.get(name);
  if (!p) {
    p = Promise.all([
      fetch(contentUrl(`fonts/${name}.fontdef`)).then((r) => (r.ok ? r.text() : '')),
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = contentUrl(`fonts/${name}.png`);
      }),
    ]).then(([def, img]) => {
      if (!def || !img) return null;
      const glyphs = new Map();
      let h = 0;
      for (const m of def.matchAll(/^\s*glyph\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gm)) {
        const key = m[1].length > 1 && m[1][0] === 'u' ? String.fromCharCode(+m[1].slice(1)) : m[1];
        const r = [+m[2] * img.width, +m[3] * img.height, (+m[4] - +m[2]) * img.width, (+m[5] - +m[3]) * img.height];
        glyphs.set(key, r);
        h = Math.max(h, r[3]);
      }
      return { img, glyphs, h };
    }).catch(() => null);
    fonts.set(name, p);
  }
  return p;
}

function glyphOf(font, ch) {
  return font.glyphs.get(ch) || font.glyphs.get('?');
}

export function measure(font, text) {
  let w = 0;
  for (const ch of text) {
    const g = glyphOf(font, ch);
    if (g) w += g[2];
  }
  return w;
}

export function wrap(font, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && measure(font, next.trimEnd()) > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
        while (measure(font, line) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measure(font, line.slice(0, cut)) > maxWidth) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

function tinted(font, lines, color, w, h, align) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  lines.forEach((line, i) => {
    let x = align === 'center' ? (w - measure(font, line)) / 2 : 0;
    for (const ch of line) {
      const gl = glyphOf(font, ch);
      if (!gl) continue;
      if (ch.trim()) g.drawImage(font.img, gl[0], gl[1], gl[2], gl[3], Math.round(x), i * font.h, gl[2], gl[3]);
      x += gl[2];
    }
  });
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function textCanvas(font, text, { color = '#fff', shadow = null, maxWidth = 0, align = 'center' } = {}) {
  const lines = maxWidth ? wrap(font, text, maxWidth) : String(text).split('\n');
  const w = Math.max(...lines.map((l) => measure(font, l)), 1);
  const h = lines.length * font.h;
  const pad = shadow ? 2 : 0;
  const out = document.createElement('canvas');
  out.width = Math.ceil(w) + pad;
  out.height = Math.ceil(h) + pad;
  const g = out.getContext('2d');
  if (shadow) g.drawImage(tinted(font, lines, shadow, w, h, align), 2, 2);
  g.drawImage(tinted(font, lines, color, w, h, align), 0, 0);
  return out;
}
