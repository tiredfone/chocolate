import { loadFont, textCanvas } from './bitmapfont.js';
import { brick as brickOf } from '../shared/brickcolor.js';
import { brick } from '../shared/brickcolor.js';
import { loadImage, assetId, nineSlice, contentUrl, contentEra, endpointUrl, contentImageUrl } from './assets.js';

const STYLE_SLICES = {
  frame1: 'textures/chatBubble_botBlue_bkg', frame2: 'textures/blackBkg_square', frame3: 'textures/blackBkg_round',
  frame4: 'textures/chatBubble_botGreen_bkg', frame5: 'textures/chatBubble_botRed_bkg',
  button1: 'textures/ui/btn_red', button2: 'textures/ui/btn_grey', bubble: 'textures/chatBubble_white_bkg',
};

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 28, 32, 42, 60, 96];
const FONTS = ['Arial, Helvetica, sans-serif'];
const BOLD = new Set([0, 2, 4]);
const FONT_FILES = {
  1: ['ch-arial', 'fonts/arial.ttf'], 2: ['ch-arialbd', 'fonts/arialbd.ttf'], 0: ['ch-arialbd', 'fonts/arialbd.ttf'],
  3: ['ch-ss', 'fonts/SourceSansPro-Regular.ttf'], 4: ['ch-ssb', 'fonts/SourceSansPro-Bold.ttf'], 16: ['ch-sssb', 'fonts/SourceSansPro-Semibold.ttf'],
  5: ['ch-ssl', 'fonts/SourceSansPro-Light.ttf'], 6: ['ch-ssi', 'fonts/SourceSansPro-It.ttf'], 7: ['ch-bodoni', 'fonts/AccanthisADFStd-Regular.otf'],
  8: ['ch-garamond', 'fonts/Guru-Regular.otf'], 9: ['ch-cartoon', 'fonts/ComicNeue-Angular-Bold.ttf'], 10: ['ch-code', 'fonts/Inconsolata-Regular.ttf'],
  11: ['ch-highway', 'fonts/HWYGOTH.ttf'], 12: ['ch-scifi', 'fonts/zekton_rg.ttf'], 13: ['ch-arcade', 'fonts/PressStart2P-Regular.ttf'],
  14: ['ch-fantasy', 'fonts/Balthazar-Regular.ttf'], 15: ['ch-antique', 'fonts/RomanAntique.otf'],
};
const loadedFonts = new Set();
function fontCss(font) {
  if (contentEra() !== 2018) return { family: FONTS[0], weight: BOLD.has(font) ? '700' : '400' };
  const f = FONT_FILES[font] || FONT_FILES[3];
  if (!loadedFonts.has(f[0]) && typeof FontFace === 'function') {
    loadedFonts.add(f[0]);
    const face = new FontFace(f[0], `url("${contentUrl(f[1])}")`);
    face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
  }
  return { family: `"${f[0]}", "Source Sans 3", Arial, sans-serif`, weight: '400' };
}
function textPx(P) {
  if (contentEra() === 2018 && P.has('TextSize')) return +P.get('TextSize') || 14;
  return FONT_SIZES[P.get('FontSize') | 0] || 12;
}
function ud(v, base) {
  return Array.isArray(v) ? base * v[0] + v[1] : 0;
}
function sortKids(kids, order) {
  const list = kids.slice();
  if (order === 0) list.sort((a, b) => String(a.props.get('Name')).localeCompare(String(b.props.get('Name'))));
  else if (order === 2) list.sort((a, b) => (a.props.get('LayoutOrder') | 0) - (b.props.get('LayoutOrder') | 0));
  return list;
}
function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function rgba(c, t = 0) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.max(0, Math.min(1, 1 - t))})`;
}

function nameColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360},70%,65%)`;
}

const imageUrls = new Map();
function thumbnailSrc(url) {
  let s = String(url || '').trim();
  if (!s) return null;
  if (/^(https?:)?\/\/([a-z0-9-]+\.)*roblox\.com\//i.test(s)) {
    const user = /[?&]user(?:Id)?=(\d+)/i.exec(s) || /\/users\/(\d+)/i.exec(s);
    if (user && /headshot|\/head\.ashx/i.test(s)) return endpointUrl('thumbnail', +user[1]) || null;
    if (user && /thumb|avatar|bust/i.test(s)) return endpointUrl('avatarThumbnail', +user[1]) || endpointUrl('thumbnail', +user[1]) || null;
    const asset = /[?&](?:assetId|placeId|aid)=(\d+)/i.exec(s) || (/thumb|icon/i.test(s) && /[?&]id=(\d+)/i.exec(s));
    if (asset && /thumb|icon/i.test(s)) return endpointUrl('placeThumbnail', +asset[1]) || null;
    return null;
  }
  const origin = location.origin.toLowerCase();
  if (s.toLowerCase().startsWith(origin + '/')) s = s.slice(origin.length);
  if (s[0] !== '/' || s[1] === '/') return null;
  const lower = s.toLowerCase();
  for (const name of ['thumbnail', 'avatarThumbnail', 'placeThumbnail']) {
    const t = endpointUrl(name, 1);
    if (!t) continue;
    const base = t.toLowerCase().split('?')[0].replace(/\/1$/, '/');
    if (lower.split('?')[0] === base || lower.startsWith(base.endsWith('/') ? base : base + '?') || (base.endsWith('/') && lower.startsWith(base))) return s;
  }
  return null;
}

function imageSrc(url) {
  const thumb = thumbnailSrc(url);
  if (thumb) return Promise.resolve(thumb);
  if (/^rbxasset:\/\//i.test(String(url || '').trim())) {
    const direct = contentImageUrl(String(url).trim());
    if (direct) return Promise.resolve(direct);
  }
  const id = assetId(url) || (/^rbxasset:\/\//i.test(String(url || '')) ? String(url) : null);
  if (!id) return Promise.resolve(null);
  let p = imageUrls.get(id);
  if (!p) {
    p = loadImage(url).then((img) => {
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.translate(0, c.height);
      g.scale(1, -1);
      g.drawImage(img, 0, 0);
      return new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : null)));
    }).catch(() => null);
    imageUrls.set(id, p);
    p.then((u) => {
      if (!u && imageUrls.get(id) === p) imageUrls.delete(id);
    });
  }
  return p;
}

let bubbleParts = null;
export function bubbleArt() {
  if (!bubbleParts) {
    const load = (name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = contentUrl(`textures/${name}.png`);
    });
    bubbleParts = Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => load(`chatBubble_white_bkg_slice${i}`)).concat([load('chatBubble_white_tail')]))
      .then((imgs) => (imgs.some((i) => !i) ? null : { slices: imgs.slice(0, 9), tail: imgs[9] }));
  }
  return bubbleParts;
}

export function drawBubble(font, art, msg) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const k = 0.4, tk = 0.6;
  const text = textCanvas(font, msg, { color: '#000', maxWidth: 360, align: 'center' });
  const s = art.slices;
  const cw = s[0].width * k, ch = s[0].height * k;
  const padX = 4, padY = 1;
  const W = Math.max(cw * 2, text.width * tk + padX * 2 + cw), H = Math.max(ch * 2, text.height * tk + padY * 2 + ch);
  const ts = art.tail.width * k, rim = 17 * k;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * dpr);
  c.height = Math.ceil((H + rim) * dpr);
  c.style.width = W + 'px';
  c.style.height = H + rim + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const xs = [0, cw, W - cw], ys = [0, ch, H - ch], ws = [cw, W - cw * 2, cw], hs = [ch, H - ch * 2, ch];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) g.drawImage(s[r * 3 + q], xs[q], ys[r], ws[q] + 0.5, hs[r] + 0.5);
  g.drawImage(art.tail, (W - ts) / 2, H - 15 * k, ts, ts);
  g.drawImage(text, (W - text.width * tk) / 2, (H - text.height * tk) / 2, text.width * tk, text.height * tk);
  return c;
}

export class Gui {
  constructor(root, world, renderer, opts) {
    this.root = root;
    this.world = world;
    this.dm = world.dm;
    this.renderer = renderer;
    this.opts = opts;
    this.nodes = new Map();
    this.dirty = true;
    this.overlay = el('div', 'ch-gui', root);
    this.screen = el('div', 'ch-screen', this.overlay);
    this.billboards = el('div', 'ch-billboards', this.overlay);
    this.tags = el('div', 'ch-tags', this.overlay);
    this.focused = null;
    this.loadStyles();
    this.touch = !!world.touch;
    if (this.touch) root.classList.add('ch-touch');
    this.buildHud();
    this.dm.observe({
      reparented: () => (this.dirty = true),
      destroyed: () => (this.dirty = true),
      changed: (inst, name) => {
        if (inst.isA('GuiBase') || inst.ClassName === 'Message' || inst.ClassName === 'Hint') this.dirty = true;
        if (inst.ClassName === 'Player' || inst.isA('ValueBase')) this.listDirty = true;
        if (inst.ClassName === 'Humanoid') this.hudDirty = true;
      },
    });
  }

  loadStyles() {
    const sheet = document.createElement('style');
    document.head.appendChild(sheet);
    const rules = [];
    Promise.all(Object.entries(STYLE_SLICES).map(async ([name, prefix]) => {
      const sl = await nineSlice(prefix);
      if (!sl) return;
      const sel = name === 'bubble' ? '.ch-bubble' : `.ch-g[data-style="${name}"]`;
      const hover = name === 'button1' || name === 'button2' ? await nineSlice(name === 'button1' ? 'textures/ui/btn_redGlow' : 'textures/ui/btn_greyTransp') : null;
      const k = name === 'bubble' ? 0.4 : 1;
      const bw = `${sl.top * k}px ${sl.right * k}px ${sl.bottom * k}px ${sl.left * k}px`;
      const bi = (x) => `url(${x.url}) ${x.top} ${x.right} ${x.bottom} ${x.left} fill stretch`;
      rules.push(`${sel}{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}`);
      rules.push(`${sel}::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-style:solid;border-width:${bw};border-image:${bi(sl)}}`);
      if (hover) rules.push(`${sel}.auto:hover::before{border-image:${bi(hover)}}`);
    })).then(() => {
      rules.push('.ch-bubble{isolation:isolate;padding:5px 9px;max-width:none;color:#000;line-height:0}');
      rules.push('.ch-bubble canvas{display:block}');
      rules.push(`.ch-bubble::after{content:"";position:absolute;left:50%;bottom:-11px;width:16px;height:16px;transform:translateX(-50%);z-index:1;background:url(${contentUrl('textures/chatBubble_white_tail.png')}) center/100% 100% no-repeat}`);
      sheet.textContent = rules.join('\n');
    });
  }

  absSize(inst) {
    const chain = [];
    let x = inst;
    while (x && !x.isA('LayerCollector')) {
      chain.push(x);
      x = x.parent;
    }
    let base = (x && x.props.get('AbsoluteSize')) || [this.overlay.clientWidth, this.overlay.clientHeight];
    for (let i = chain.length - 1; i >= 0; i--) {
      const s = chain[i].props.get('Size');
      if (Array.isArray(s) && s.length === 4) base = [s[0] * base[0] + s[1], s[2] * base[1] + s[3]];
    }
    return base;
  }

  textBounds(inst) {
    const P = inst.props;
    const text = String(P.get('Text') ?? '');
    if (text === '') return [0, 0];
    const font = P.get('Font') | 0;
    let px = textPx(P);
    const wrapOn = P.get('TextWrapped') || P.get('TextWrap');
    const size = wrapOn || P.get('TextScaled') ? this.absSize(inst) : null;
    if (P.get('TextScaled')) px = Math.max(6, Math.min(100, Math.floor(Math.min(size[1] * 0.85, (size[0] / Math.max(1, text.length)) * 1.8))));
    if (!this.measure) this.measure = document.createElement('canvas').getContext('2d');
    const g = this.measure;
    const fc = fontCss(font);
    g.font = `${fc.weight} ${px}px ${fc.family}`;
    const lines = [];
    for (const para of text.split('\n')) {
      if (!wrapOn) {
        lines.push(para);
        continue;
      }
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const next = line + word;
        if (line && g.measureText(next.trimEnd()).width > size[0]) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line = next;
      }
      lines.push(line);
    }
    return [Math.max(...lines.map((l) => g.measureText(l).width)), lines.length * Math.round(px * 1.15)];
  }

  buildHud() {
    this.hint = el('div', 'ch-hint', this.overlay);
    this.hint.hidden = true;
    this.message = el('div', 'ch-message', this.overlay);
    this.message.hidden = true;
  }

  isTyping() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && a.type !== 'range';
  }

  bubble(part, msg) {
    if (!part) return;
    const b = el('div', 'ch-bubble2', this.tags);
    b.style.visibility = 'hidden';
    Promise.all([loadFont('Arial-18pt'), bubbleArt()]).then(([font, art]) => {
      if (!font || !art) {
        b.className = 'ch-bubble';
        b.textContent = msg;
      } else b.appendChild(drawBubble(font, art, msg));
      b.style.visibility = '';
    });
    const rec = { part, el: b, until: performance.now() + 7000 };
    if (!this.bubbles) this.bubbles = [];
    const same = this.bubbles.filter((x) => x.part === part);
    for (const s of same) s.stack = (s.stack || 0) + 1;
    this.bubbles.push(rec);
  }

  setHint(text) {
    this.forcedMessage = text;
    this.dirty = true;
  }

  screenGuis() {
    const out = [];
    const cg = this.dm.services.get('CoreGui');
    if (cg) for (const c of cg.children) if (c.isA('ScreenGui')) out.push(c);
    const pg = this.world.player && this.world.player.findChildOfClass('PlayerGui');
    if (pg) for (const c of pg.children) if (c.isA('ScreenGui')) out.push(c);
    return out;
  }

  layout() {
    let [l, t, r, b] = this.world.guiInset || [0, 0, 0, 0];
    const era = contentEra();
    let top18 = 0;
    if (era === 2018) {
      top18 = t || 36;
      t = 0;
    }
    const k = this.world.guiScale ? this.world.guiScale() : 1;
    const SW = Math.round(this.overlay.clientWidth * k), SH = Math.round(this.overlay.clientHeight * k);
    if (this.scaleKey !== `${SW}x${SH}x${k}`) {
      this.scaleKey = `${SW}x${SH}x${k}`;
      const st = this.screen.style;
      st.right = st.bottom = 'auto';
      st.width = SW + 'px';
      st.height = SH + 'px';
      st.zoom = String(1 / k);
      st.setProperty('--ch-k', String(k));
    }
    const W = Math.max(0, SW - l - r), H = Math.max(0, SH - t - b);
    const live = new Set();
    const pg = this.world.player && this.world.player.findChildOfClass('PlayerGui');
    let order = 0;
    for (const sg of this.screenGuis()) {
      const top = era === 2018 && !sg.props.get('IgnoreGuiInset') ? top18 : 0;
      const GH = Math.max(0, H - top);
      const as = sg.props.get('AbsoluteSize');
      if (!as || as[0] !== W || as[1] !== GH) {
        this.dm.setProp(sg, 'AbsoluteSize', [W, GH]);
        this.notify(sg, 'AbsoluteSize');
      }
      const node = this.nodeFor(sg, this.screen);
      node.el.style.zIndex = String((sg.parent && sg.parent.ClassName === 'CoreGui' ? 1000 : 10) + (sg.props.get('DisplayOrder') || 0));
      live.add(sg);
      node.el.style.display = sg.props.get('Enabled') === false ? 'none' : '';
      node.el.style.inset = `${t + top}px ${r}px ${b}px ${l}px`;
      this.layoutChildren(sg, node, era === 2018 ? [l, sg.props.get('IgnoreGuiInset') ? -top18 : 0] : [l, t], [W, GH], live, order++);
    }
    for (const [inst, node] of this.nodes) {
      if (!live.has(inst) && !node.billboard && !(this.bbLive && this.bbLive.has(inst))) {
        node.el.remove();
        this.nodes.delete(inst);
      }
    }
    let hintText = null, msgText = this.forcedMessage || null;
    const ws = this.dm.services.get('Workspace');
    for (const src of [ws, pg]) {
      if (!src) continue;
      for (const c of src.children) {
        if (c.ClassName === 'Hint') hintText = c.props.get('Text');
        else if (c.ClassName === 'Message') msgText = c.props.get('Text');
      }
    }
    this.hint.hidden = !hintText;
    if (hintText && this.hint.textContent !== hintText) this.hint.textContent = hintText;
    this.message.hidden = !msgText;
    if (msgText && this.message.textContent !== msgText) this.message.textContent = msgText;
  }

  nodeFor(inst, parentEl) {
    let node = this.nodes.get(inst);
    if (node) {
      if (node.el.parentElement !== parentEl) parentEl.appendChild(node.el);
      return node;
    }
    const cls = inst.ClassName;
    let e;
    if (cls === 'TextBox') {
      e = el(inst.props.get('MultiLine') ? 'textarea' : 'input', 'ch-g ch-g-box', parentEl);
      e.spellcheck = false;
      e.addEventListener('focus', () => {
        this.focused = inst;
        if (inst.props.get('ClearTextOnFocus')) {
          e.value = '';
        }
        this.dm.emit(inst, 'Focused');
      });
      const commit = (enter) => {
        if (this.focused !== inst) return;
        this.focused = null;
        inst.props.set('Text', e.value);
        this.dm.emit(inst, 'Changed', 'Text');
        this.dm.emit(inst, 'FocusLost', enter);
        if (inst.id > 0) this.opts.send({ t: 'txt', id: inst.id, text: e.value, done: true, enter });
      };
      e.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !inst.props.get('MultiLine')) {
          commit(true);
          e.blur();
        }
      });
      e.addEventListener('blur', () => commit(false));
    } else {
      e = el('div', 'ch-g', parentEl);
    }
    node = { el: e, inst, text: null, img: null, imgUrl: null };
    if (!inst.isA('GuiButton') && cls !== 'TextBox') e.classList.add('ch-g-pass');
    if (cls === 'TextLabel' || cls === 'TextButton') node.text = el('span', 'ch-g-text', e);
    if (cls === 'ImageLabel' || cls === 'ImageButton') {
      node.clip = el('div', 'ch-g-clip', e);
      node.img = el('img', 'ch-g-img', node.clip);
      node.img.alt = '';
      node.img.draggable = false;
      node.img.addEventListener('load', () => (this.dirty = true));
    }
    if (inst.isA('GuiButton')) {
      e.classList.add('ch-g-btn');
      const fire = (ev, name) => {
        ev.stopPropagation();
        this.dm.emit(inst, name, ev.offsetX | 0, ev.offsetY | 0);
        if (inst.id > 0) this.opts.send({ t: 'gui', id: inst.id, ev: name, x: ev.clientX | 0, y: ev.clientY | 0 });
      };
      e.addEventListener('pointerdown', (ev) => {
        if (ev.button === 0) fire(ev, 'MouseButton1Down');
        else if (ev.button === 2) fire(ev, 'MouseButton2Down');
      });
      e.addEventListener('pointerup', (ev) => {
        if (ev.button === 0) fire(ev, 'MouseButton1Up');
        else if (ev.button === 2) fire(ev, 'MouseButton2Up');
      });
      e.addEventListener('click', (ev) => {
        fire(ev, 'MouseButton1Click');
        if (this.touch && this.opts.flush) this.opts.flush();
      });
      e.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        fire(ev, 'MouseButton2Click');
      });
    }
    if (cls === 'ImageButton') {
      e.addEventListener('pointerenter', () => { node.hover = true; this.dirty = true; });
      e.addEventListener('pointerleave', () => { node.hover = false; node.pressed = false; this.dirty = true; });
      e.addEventListener('pointerdown', () => { node.pressed = true; this.dirty = true; });
      e.addEventListener('pointerup', () => { node.pressed = false; this.dirty = true; });
    }
    if (inst.isA('GuiObject')) {
      e.addEventListener('pointerenter', (ev) => {
        this.dm.emit(inst, 'MouseEnter', ev.offsetX | 0, ev.offsetY | 0);
        if (inst.id > 0 && inst.isA('GuiButton')) this.opts.send({ t: 'gui', id: inst.id, ev: 'MouseEnter' });
      });
      e.addEventListener('pointerleave', (ev) => {
        this.dm.emit(inst, 'MouseLeave', ev.offsetX | 0, ev.offsetY | 0);
        if (inst.id > 0 && inst.isA('GuiButton')) this.opts.send({ t: 'gui', id: inst.id, ev: 'MouseLeave' });
      });
    }
    this.nodes.set(inst, node);
    return node;
  }

  notify(inst, prop) {
    const dm = this.dm;
    if (!dm.luaSink) return;
    if (dm.luaSubs.has(inst.id + ':Changed')) dm.luaSink(inst, 'Changed', [prop]);
    if (dm.luaSubs.has(inst.id + ':P:' + prop)) dm.luaSink(inst, 'P:' + prop, []);
  }

  setAbs(c, name, v) {
    const old = c.props.get(name);
    if (old && old[0] === v[0] && old[1] === v[1]) return;
    c.props.set(name, v);
    this.notify(c, name);
  }

  constrain(c, w, h, area) {
    for (const k of c.children) {
      const n = k.ClassName;
      if (n === 'UIAspectRatioConstraint') {
        const ar = Math.max(1e-3, +k.props.get('AspectRatio') || 1);
        if ((k.props.get('AspectType') | 0) === 1) {
          if (area && contentEra() === 2018) {
            w = area[0];
            h = area[1];
            if (w / Math.max(1e-3, h) > ar) w = h * ar;
            else h = w / ar;
          } else if ((k.props.get('DominantAxis') | 0) === 1) w = h * ar;
          else h = w / ar;
        } else if (w / Math.max(1e-3, h) > ar) w = h * ar;
        else h = w / ar;
      } else if (n === 'UISizeConstraint') {
        const mn = k.props.get('MinSize') || [0, 0], mx = k.props.get('MaxSize') || [1e9, 1e9];
        w = Math.max(mn[0], Math.min(mx[0], w));
        h = Math.max(mn[1], Math.min(mx[1], h));
      }
    }
    return [Math.round(w), Math.round(h)];
  }

  arrange(layout, objs, sizes, area) {
    const P = layout.props;
    const pos = new Map();
    const vis = objs.filter((c) => c.props.get('Visible'));
    const list = sortKids(vis, P.get('SortOrder') | 0);
    const ha = P.get('HorizontalAlignment') | 0, va = P.get('VerticalAlignment') | 0;
    const alignX = (span) => (ha === 0 ? (area[0] - span) / 2 : ha === 2 ? area[0] - span : 0);
    const alignY = (span) => (va === 0 ? (area[1] - span) / 2 : va === 2 ? area[1] - span : 0);
    let content;
    if (layout.ClassName === 'UIGridLayout') {
      const cs = P.get('CellSize') || [0, 100, 0, 100], cp = P.get('CellPadding') || [0, 5, 0, 5];
      const cw = ud([cs[0], cs[1]], area[0]), chh = ud([cs[2], cs[3]], area[1]);
      const px = ud([cp[0], cp[1]], area[0]), py = ud([cp[2], cp[3]], area[1]);
      const vertical = (P.get('FillDirection') | 0) === 1;
      const maxCells = P.get('FillDirectionMaxCells') | 0;
      let per = vertical ? Math.floor((area[1] + py) / Math.max(1, chh + py)) : Math.floor((area[0] + px) / Math.max(1, cw + px));
      per = Math.max(1, maxCells > 0 ? Math.min(per, maxCells) : per);
      const n = list.length;
      const major = Math.ceil(n / per), minor = Math.min(n, per);
      const cols = vertical ? major : minor, rows = vertical ? minor : major;
      content = [Math.max(0, cols * (cw + px) - px), Math.max(0, rows * (chh + py) - py)];
      const ox = alignX(content[0]), oy = alignY(content[1]);
      list.forEach((c, i) => {
        const a = Math.floor(i / per), b = i % per;
        const col = vertical ? a : b, row = vertical ? b : a;
        sizes.set(c, [Math.round(cw), Math.round(chh)]);
        pos.set(c, [Math.round(ox + col * (cw + px)), Math.round(oy + row * (chh + py))]);
      });
    } else {
      const vertical = (P.get('FillDirection') | 0) === 1;
      const pad = ud(P.get('Padding'), vertical ? area[1] : area[0]);
      let total = 0, cross = 0;
      for (const c of list) {
        const sz = sizes.get(c);
        total += vertical ? sz[1] : sz[0];
        cross = Math.max(cross, vertical ? sz[0] : sz[1]);
      }
      total += Math.max(0, list.length - 1) * pad;
      content = vertical ? [cross, total] : [total, cross];
      let at = vertical ? alignY(total) : alignX(total);
      for (const c of list) {
        const sz = sizes.get(c);
        if (vertical) {
          pos.set(c, [Math.round(alignX(sz[0])), Math.round(at)]);
          at += sz[1] + pad;
        } else {
          pos.set(c, [Math.round(at), Math.round(alignY(sz[1]))]);
          at += sz[0] + pad;
        }
      }
    }
    layout.data = Object.assign(layout.data || {}, {});
    const old = layout.data.content;
    if (!old || old[0] !== content[0] || old[1] !== content[1]) {
      layout.data.content = content;
      this.notify(layout, 'AbsoluteContentSize');
    }
    return pos;
  }

  measureKids(parent, pSize, pnode) {
    let inner = [0, 0], area = pSize, layout = null;
    const scroll = pnode && parent.ClassName === 'ScrollingFrame' ? pnode : null;
    let canvas = null;
    if (scroll) {
      const cs = parent.props.get('CanvasSize') || [0, 0, 2, 0];
      canvas = [Math.max(pSize[0], ud([cs[0], cs[1]], pSize[0])), Math.max(pSize[1], ud([cs[2], cs[3]], pSize[1]))];
      area = canvas;
    }
    for (const c of parent.children) {
      const n = c.ClassName;
      if (n === 'UIPadding') {
        const L = ud(c.props.get('PaddingLeft'), area[0]), R = ud(c.props.get('PaddingRight'), area[0]);
        const T = ud(c.props.get('PaddingTop'), area[1]), B = ud(c.props.get('PaddingBottom'), area[1]);
        inner = [L, T];
        area = [Math.max(0, area[0] - L - R), Math.max(0, area[1] - T - B)];
      } else if (n === 'UIListLayout' || n === 'UIGridLayout') layout = c;
    }
    const objs = parent.children.filter((c) => c.isA('GuiObject'));
    const sizes = new Map();
    for (const c of objs) {
      const P = c.props;
      const sz = P.get('Size');
      const cons = P.get('SizeConstraint');
      const rx = cons === 2 ? area[1] : area[0];
      const ry = cons === 1 ? area[0] : area[1];
      sizes.set(c, this.constrain(c, rx * sz[0] + sz[1], ry * sz[2] + sz[3], area));
    }
    const placed = layout ? this.arrange(layout, objs, sizes, area) : null;
    return { inner, area, objs, sizes, placed, scroll, canvas };
  }

  posOf(c, placed, sizes, area, inner) {
    const [w, h] = sizes.get(c);
    let x, y;
    if (placed && placed.has(c)) [x, y] = placed.get(c);
    else {
      const ps = c.props.get('Position');
      const ap = c.props.get('AnchorPoint') || [0, 0];
      x = Math.round(area[0] * ps[0] + ps[1] - ap[0] * w);
      y = Math.round(area[1] * ps[2] + ps[3] - ap[1] * h);
    }
    return [x + inner[0], y + inner[1]];
  }

  measureHidden(parent, pPos, pSize, depth = 0) {
    if (depth > 40) return;
    const { inner, area, objs, sizes, placed } = this.measureKids(parent, pSize);
    for (const c of objs) {
      const [x, y] = this.posOf(c, placed, sizes, area, inner);
      const abs = [pPos[0] + x, pPos[1] + y];
      this.setAbs(c, 'AbsolutePosition', abs);
      this.setAbs(c, 'AbsoluteSize', sizes.get(c));
      if (c.children.length) this.measureHidden(c, abs, sizes.get(c), depth + 1);
    }
  }

  layoutChildren(parent, pnode, pPos, pSize, live, zBase) {
    const { inner, area, objs, sizes, placed, scroll, canvas } = this.measureKids(parent, pSize, pnode);
    let scrollOff = [0, 0];
    if (scroll) {
      const e = scroll.el;
      if (!scroll.sizer) {
        scroll.sizer = el('div', 'ch-g-sizer', e);
        e.addEventListener('scroll', () => {
          const v = [Math.round(e.scrollLeft), Math.round(e.scrollTop)];
          const cur = parent.props.get('CanvasPosition') || [0, 0];
          if (cur[0] !== v[0] || cur[1] !== v[1]) this.dm.setProp(parent, 'CanvasPosition', v);
          this.dirty = true;
        }, { passive: true });
      }
      scroll.sizer.style.width = canvas[0] + 'px';
      scroll.sizer.style.height = canvas[1] + 'px';
      const want = parent.props.get('CanvasPosition') || [0, 0];
      if (Math.abs(e.scrollLeft - want[0]) > 1) e.scrollLeft = want[0];
      if (Math.abs(e.scrollTop - want[1]) > 1) e.scrollTop = want[1];
      scrollOff = [e.scrollLeft, e.scrollTop];
    }
    for (const c of objs) {
      live.add(c);
      const node = this.nodeFor(c, pnode.el);
      const P = c.props;
      const [w, h] = sizes.get(c);
      const [x, y] = this.posOf(c, placed, sizes, area, inner);
      const abs = [pPos[0] + x - scrollOff[0], pPos[1] + y - scrollOff[1]];
      this.setAbs(c, 'AbsolutePosition', abs);
      this.setAbs(c, 'AbsoluteSize', [w, h]);
      const st = node.el.style;
      if (!c.isA('GuiButton') && c.ClassName !== 'TextBox') node.el.classList.toggle('ch-g-pass', !P.get('Active') && c.ClassName !== 'ScrollingFrame');
      const typing = this.touch && c.ClassName === 'TextBox' && this.focused === c;
      node.el.classList.toggle('ch-g-box-typing', typing);
      const visible = P.get('Visible') || typing;
      st.display = visible ? '' : 'none';
      if (!visible) {
        if (c.children.length && contentEra() === 2018) this.measureHidden(c, abs, [w, h]);
        continue;
      }
      st.left = x + 'px';
      st.top = y + 'px';
      st.width = Math.max(0, w) + 'px';
      st.height = Math.max(0, h) + 'px';
      st.zIndex = String(P.get('ZIndex') || 1);
      const scaleInst = c.children.find((k) => k.ClassName === 'UIScale');
      const rot = +P.get('Rotation') || 0;
      const sc = scaleInst ? +scaleInst.props.get('Scale') || 1 : 1;
      st.transform = rot || sc !== 1 ? `${rot ? `rotate(${rot}deg)` : ''}${sc !== 1 ? ` scale(${sc})` : ''}` : '';
      if (sc !== 1) {
        const ap = P.get('AnchorPoint') || [0, 0];
        st.transformOrigin = `${ap[0] * 100}% ${ap[1] * 100}%`;
      }
      if (c.ClassName === 'ScrollingFrame') {
        const cs = P.get('CanvasSize') || [0, 0, 2, 0];
        const cw = ud([cs[0], cs[1]], w), chh = ud([cs[2], cs[3]], h);
        const on = P.get('ScrollingEnabled') !== false;
        st.overflow = '';
        st.overflowX = on && cw > w + 1 ? 'auto' : 'hidden';
        st.overflowY = on && chh > h + 1 ? 'auto' : 'hidden';
        node.el.classList.add('ch-g-scroll');
        node.el.classList.toggle('ch-g-nobar', P.has('ScrollBarThickness') && (P.get('ScrollBarThickness') | 0) <= 0);
      } else st.overflow = P.get('ClipsDescendants') ? 'hidden' : 'visible';
      const style = P.get('Style') | 0;
      const bt = P.get('BackgroundTransparency');
      const bc = P.get('BackgroundColor3');
      node.el.dataset.style = '';
      if (c.ClassName === 'Frame' && style > 0) node.el.dataset.style = 'frame' + style;
      else if (c.isA('GuiButton') && style > 0) node.el.dataset.style = 'button' + style;
      st.background = node.el.dataset.style ? '' : rgba(bc, bt);
      const bs = P.get('BorderSizePixel');
      st.boxShadow = bs > 0 && bt < 1 && !node.el.dataset.style ? `0 0 0 ${bs}px ${rgba(P.get('BorderColor3'), bt)}` : 'none';
      if (c.isA('GuiButton')) node.el.classList.toggle('auto', !!P.get('AutoButtonColor'));
      if (node.text || c.ClassName === 'TextBox') this.styleText(c, node, w, h);
      if (node.img) {
        const hover = P.has('HoverImage') && node.hover ? P.get('HoverImage') : '';
        const pressed = P.has('PressedImage') && node.pressed ? P.get('PressedImage') : '';
        const url = pressed || hover || P.get('Image');
        if (url !== node.imgUrl) {
          node.imgUrl = url;
          node.img.removeAttribute('src');
          node.img.style.visibility = 'hidden';
          node.imgSrc = null;
          imageSrc(url).then((u) => {
            if (node.imgUrl !== url) return;
            if (u) {
              node.img.src = u;
              node.imgSrc = u;
              node.img.style.visibility = '';
              node.imgTries = 0;
              this.dirty = true;
            } else if (url && (node.imgTries = (node.imgTries || 0) + 1) < 6) {
              setTimeout(() => {
                if (node.imgUrl === url) {
                  node.imgUrl = null;
                  this.dirty = true;
                }
              }, 2000 * node.imgTries);
            }
          });
        }
        this.imageMode(node, P, w, h);
        const ic = P.get('ImageColor3');
        node.img.style.opacity = String(1 - P.get('ImageTransparency'));
        node.clip.style.opacity = node.img.style.opacity;
        node.img.style.filter = ic[0] < 0.99 || ic[1] < 0.99 || ic[2] < 0.99 ? `brightness(${(ic[0] + ic[1] + ic[2]) / 3})` : '';
      }
      this.layoutChildren(c, node, abs, [w, h], live);
    }
  }

  imageMode(node, P, w, h) {
    const mode = P.get('ScaleType') | 0;
    const cs = node.clip.style;
    const is = node.img.style;
    if (mode === 1 && node.imgSrc && node.img.naturalWidth) {
      const nw = node.img.naturalWidth, nh = node.img.naturalHeight;
      const r = P.get('SliceCenter') || [0, 0, 0, 0];
      const k = P.has('SliceScale') ? +P.get('SliceScale') || 1 : 1;
      let top = Math.max(0, r[1]), left = Math.max(0, r[0]), right = Math.max(0, nw - r[2]), bottom = Math.max(0, nh - r[3]);
      if (left + right >= nw && nw > 1) right = Math.max(0, nw - left - 1);
      if (left + right >= nw && nw > 1) left = Math.max(0, nw - right - 1);
      if (top + bottom >= nh && nh > 1) bottom = Math.max(0, nh - top - 1);
      if (top + bottom >= nh && nh > 1) top = Math.max(0, nh - bottom - 1);
      is.display = 'none';
      cs.borderStyle = 'solid';
      cs.borderWidth = `${top * k}px ${right * k}px ${bottom * k}px ${left * k}px`;
      cs.borderImage = `url(${node.imgSrc}) ${top} ${right} ${bottom} ${left} fill stretch`;
      cs.boxSizing = 'border-box';
      cs.background = '';
      return;
    }
    if (cs.borderImage) {
      cs.borderImage = '';
      cs.borderWidth = '0';
      cs.borderStyle = '';
    }
    if (mode === 2 && node.imgSrc) {
      const ts = P.get('TileSize') || [1, 0, 1, 0];
      is.display = 'none';
      cs.background = `url(${node.imgSrc}) 0 0 / ${ud([ts[0], ts[1]], w)}px ${ud([ts[2], ts[3]], h)}px repeat`;
      return;
    }
    cs.background = '';
    is.display = '';
    is.objectFit = mode === 3 ? 'contain' : mode === 4 ? 'cover' : '';
    this.imageRect(node, P, w, h);
  }

  imageRect(node, P, w, h) {
    const rs = P.get('ImageRectSize'), ro = P.get('ImageRectOffset');
    const st = node.img.style;
    const nw = node.img.naturalWidth, nh = node.img.naturalHeight;
    if (!rs || rs[0] <= 0 || rs[1] <= 0 || !nw || !nh) {
      if (st.width) st.left = st.top = st.width = st.height = '';
      return;
    }
    const kx = w / rs[0], ky = h / rs[1];
    st.left = -(ro ? ro[0] : 0) * kx + 'px';
    st.top = -(ro ? ro[1] : 0) * ky + 'px';
    st.width = nw * kx + 'px';
    st.height = nh * ky + 'px';
  }

  scaledPx(c, text, w, h, font) {
    const lim = c.children.find((k) => k.ClassName === 'UITextSizeConstraint');
    const lo = lim ? +lim.props.get('MinTextSize') || 1 : 1, hi = lim ? +lim.props.get('MaxTextSize') || 100 : 100;
    if (!this.measure) this.measure = document.createElement('canvas').getContext('2d');
    const f = fontCss(font);
    let a = Math.max(1, lo), b = Math.min(100, hi);
    while (b - a > 1) {
      const m = Math.floor((a + b) / 2);
      this.measure.font = `${f.weight} ${m}px ${f.family}`;
      const tw = Math.max(...String(text).split('\n').map((l) => this.measure.measureText(l).width));
      if (tw <= w && m * 1.15 * String(text).split('\n').length <= h) a = m;
      else b = m;
    }
    return a;
  }

  measureText(text, size, font, frame) {
    if (!this.measure) this.measure = document.createElement('canvas').getContext('2d');
    const f = fontCss(font | 0);
    const g = this.measure;
    g.font = `${f.weight} ${size}px ${f.family}`;
    const maxW = frame && frame[0] > 0 ? frame[0] : 1e9;
    const lines = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const next = line + word;
        if (line && g.measureText(next.trimEnd()).width > maxW) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line = next;
      }
      lines.push(line);
    }
    return [Math.ceil(Math.max(0, ...lines.map((l) => g.measureText(l).width))), Math.ceil(lines.length * size)];
  }

  styleText(c, node, w, h) {
    const P = c.props;
    const e = c.ClassName === 'TextBox' ? node.el : node.text;
    const font = P.get('Font') | 0;
    let px = textPx(P);
    const text = P.get('Text') ?? '';
    const era = contentEra();
    if (P.get('TextScaled')) px = era === 2018 ? this.scaledPx(c, text, w, h, font) : Math.max(6, Math.min(100, Math.floor(Math.min(h * 0.85, (w / Math.max(1, text.length)) * 1.8))));
    const st = e.style;
    const fc = fontCss(font);
    st.fontFamily = fc.family;
    st.fontWeight = fc.weight;
    st.fontSize = px + 'px';
    st.color = rgba(P.get('TextColor3'), P.get('TextTransparency'));
    const stroke = P.get('TextStrokeTransparency');
    if (stroke < 1) {
      const sc = rgba(P.get('TextStrokeColor3'), Math.max(stroke, P.get('TextTransparency')));
      st.textShadow = `-1px -1px 0 ${sc}, 1px -1px 0 ${sc}, -1px 1px 0 ${sc}, 1px 1px 0 ${sc}`;
    } else st.textShadow = 'none';
    const wrap = P.get('TextWrapped') || P.get('TextWrap');
    st.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    if (era === 2018) {
      st.lineHeight = P.has('LineHeight') ? String((+P.get('LineHeight') || 1) * 1.15) : '';
      const trunc = (P.get('TextTruncate') | 0) === 1;
      st.textOverflow = trunc ? 'ellipsis' : '';
      st.overflow = trunc ? 'hidden' : 'visible';
      st.maxWidth = trunc || wrap ? '100%' : 'none';
      st.flexShrink = trunc || wrap ? '' : '0';
    }
    const xa = P.get('TextXAlignment'), ya = P.get('TextYAlignment');
    if (c.ClassName === 'TextBox') {
      st.textAlign = xa === 0 ? 'left' : xa === 1 ? 'right' : 'center';
      if (document.activeElement !== e && e.value !== text) e.value = text;
      return;
    }
    const box = node.el.style;
    box.display = 'flex';
    box.justifyContent = xa === 0 ? 'flex-start' : xa === 1 ? 'flex-end' : 'center';
    box.alignItems = ya === 0 ? 'flex-start' : ya === 2 ? 'flex-end' : 'center';
    st.textAlign = xa === 0 ? 'left' : xa === 1 ? 'right' : 'center';
    if (e.textContent !== text) e.textContent = text;
    P.set('TextBounds', this.textBounds(c));
  }

  project(pos) {
    const cam = this.renderer.camera;
    const v = new (cam.position.constructor)(pos[0], pos[1], pos[2]);
    v.project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * this.overlay.clientWidth, (-v.y * 0.5 + 0.5) * this.overlay.clientHeight, v.z];
  }

  updateTags() {
    const now = performance.now();
    const seen = new Set();
    if (!this.tagEls) this.tagEls = new Map();
    const camPos = this.renderer.camera.position;
    const ws = this.dm.services.get('Workspace');
    if (ws && (!this.humScan || now - this.humScan > 500)) {
      this.humScan = now;
      this.humList = ws.descendants().filter((d) => d.ClassName === 'Humanoid');
    }
    const ownModel = this.world.own ? this.world.own.model : null;
    for (const hum of this.humList || []) {
      const model = hum.parent;
      if (hum.destroyed || !model || model === ownModel || !ws || !model.isDescendantOf(ws)) continue;
      const head = model.findChild('Head');
      if (!head || !head.isA('BasePart')) continue;
      if (seen.has(model)) continue;
      const rec = model;
      const cf = head.props.get('CFrame');
      const d = Math.hypot(cf[0] - camPos.x, cf[1] - camPos.y, cf[2] - camPos.z);
      if (d > 60) continue;
      const p = this.project([cf[0], cf[1] + 2.2, cf[2]]);
      if (!p) continue;
      if (!this.tagSight) this.tagSight = new Map();
      let sight = this.tagSight.get(model);
      if (!sight || now - sight.t > 150) {
        const o = [camPos.x, camPos.y, camPos.z];
        const hit = this.world.physics ? this.world.physics.raycast(o, [cf[0] - o[0], cf[1] - o[1], cf[2] - o[2]], [model, ownModel], (q) => q.props.get('Transparency') < 0.95) : null;
        sight = { t: now, clear: !(hit && hit.part) };
        this.tagSight.set(model, sight);
      }
      if (!sight.clear) continue;
      seen.add(rec);
      let t = this.tagEls.get(rec);
      if (!t) {
        const box = el('div', 'ch-tag', this.tags);
        const n = el('div', 'ch-tag-name', box);
        const bar = el('div', 'ch-tag-bar', box);
        const fill = el('div', 'ch-tag-fill', bar);
        t = { box, n, bar, fill, key: '' };
        this.tagEls.set(rec, t);
      }
      const name = model.props.get('Name');
      const pl = this.world.dm.services.get('Players').children.find((c) => c.ClassName === 'Player' && c.props.get('Character') === model);
      let color = '#fff';
      if (pl && !pl.props.get('Neutral')) {
        const b = brickOf(pl.props.get('TeamColor'));
        color = `rgb(${Math.round(b.r * 255)},${Math.round(b.g * 255)},${Math.round(b.b * 255)})`;
      }
      else if (pl) {
        const perk = pl.findChild('SolarPerks');
        const nc = perk && perk.findChild('NameColor');
        const v = nc && nc.ClassName === 'Color3Value' ? nc.props.get('Value') : null;
        if (v) color = `rgb(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)})`;
      }
      const key = name + '|' + color;
      if (t.key !== key) {
        t.key = key;
        loadFont('ArialBold-18pt').then((font) => {
          if (t.key !== key) return;
          if (!font) {
            t.n.textContent = name;
            t.n.style.color = color;
            return;
          }
          const c = textCanvas(font, name, { color, shadow: 'rgba(0,0,0,0.8)' });
          c.style.width = c.width * 0.62 + 'px';
          c.style.height = c.height * 0.62 + 'px';
          t.n.replaceChildren(c);
        });
      }
      const sc = Math.max(0.6, Math.min(1, 40 / Math.max(1, d)));
      const h = hum.props.get('Health'), mh = hum.props.get('MaxHealth');
      t.bar.hidden = !(mh > 0);
      t.fill.style.width = (mh > 0 ? Math.max(0, Math.min(100, (h / mh) * 100)) : 0) + '%';
      t.box.style.transformOrigin = '0 0';
      t.box.style.transform = `translate(${p[0]}px, ${p[1]}px) scale(${sc}) translate(-50%, -100%)`;
    }
    for (const [rec, t] of this.tagEls) {
      if (!seen.has(rec)) {
        t.box.remove();
        this.tagEls.delete(rec);
      }
    }
    if (this.tagSight) for (const m of this.tagSight.keys()) {
      if (!seen.has(m) && (m.destroyed || !ws || !m.isDescendantOf(ws))) this.tagSight.delete(m);
    }
    if (this.bubbles) {
      const stackCount = new Map();
      this.bubbles = this.bubbles.filter((b) => {
        if (now > b.until || b.part.destroyed) {
          b.el.remove();
          return false;
        }
        const cf = b.part.props.get('CFrame');
        const p = this.project([cf[0], cf[1] + 3.2, cf[2]]);
        if (!p) {
          b.el.style.display = 'none';
          return true;
        }
        const k = (stackCount.get(b.part) || 0);
        stackCount.set(b.part, k + 1);
        b.el.style.display = '';
        const bd = Math.hypot(cf[0] - camPos.x, cf[1] - camPos.y, cf[2] - camPos.z);
        const bs = Math.max(0.5, Math.min(1, 1.15 - bd / 110));
        b.el.style.transform = `translate(${p[0]}px, ${p[1]}px) scale(${bs}) translate(-50%, ${-100 - (b.stack || 0) * 115}%) translateY(-12px)`;
        b.el.style.transformOrigin = '0 0';
        b.el.style.opacity = b.stack ? String(Math.max(0.35, 1 - b.stack * 0.25)) : '1';
        return true;
      });
    }
  }

  updateBillboards() {
    const ws = this.dm.services.get('Workspace');
    const pg = this.world.player && this.world.player.findChildOfClass('PlayerGui');
    const list = [];
    const scan = (root) => {
      if (!root) return;
      for (const d of root.descendants()) if (d.ClassName === 'BillboardGui') list.push(d);
    };
    if (this.frameCount % 15 === 0 || !this.bbWorld) {
      scan(ws);
      this.bbWorld = list.slice();
    }
    list.length = 0;
    scan(pg);
    this.bbList = this.bbWorld.concat(list);
    const live = new Set();
    for (const bb of this.bbList) {
      if (bb.destroyed) continue;
      const ad = bb.props.get('Adornee') || (bb.parent && bb.parent.isA('BasePart') ? bb.parent : null);
      if (!ad || !ad.isA('BasePart') || bb.props.get('Enabled') === false) continue;
      const cf = ad.props.get('CFrame');
      const off = bb.props.get('StudsOffset') || [0, 0, 0];
      const wo = bb.props.get('StudsOffsetWorldSpace') || [0, 0, 0];
      const ex = bb.props.get('ExtentsOffset') || [0, 0, 0];
      const as = ad.props.get('Size') || [0, 0, 0];
      const camq = this.renderer.camera.quaternion;
      const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => new (this.renderer.camera.position.constructor)(v[0], v[1], v[2]).applyQuaternion(camq));
      const loc = [off[0] + ex[0] * as[0] / 2, off[1] + ex[1] * as[1] / 2, off[2] + ex[2] * as[2] / 2];
      const at = [cf[0] + wo[0], cf[1] + wo[1], cf[2] + wo[2]];
      for (let i = 0; i < 3; i++) {
        at[0] += basis[i].x * loc[i];
        at[1] += basis[i].y * loc[i];
        at[2] += basis[i].z * loc[i];
      }
      const p = this.project(at);
      const node = this.nodeFor(bb, this.billboards);
      node.billboard = true;
      live.add(bb);
      if (!p) {
        node.el.style.display = 'none';
        continue;
      }
      const cam = this.renderer.camera;
      const dist = Math.max(0.1, cam.position.distanceTo({ x: cf[0], y: cf[1], z: cf[2] }));
      const pxPerStud = this.overlay.clientHeight / (2 * dist * Math.tan((cam.fov * Math.PI) / 360));
      const sz = bb.props.get('Size');
      const w = sz[0] * pxPerStud + sz[1], h = sz[2] * pxPerStud + sz[3];
      const st = node.el.style;
      st.display = '';
      st.left = p[0] - w / 2 + 'px';
      st.top = p[1] - h / 2 + 'px';
      st.width = w + 'px';
      st.height = h + 'px';
      st.zIndex = String(Math.round(1000 - dist));
      this.layoutChildren(bb, node, [p[0] - w / 2, p[1] - h / 2], [w, h], live);
    }
    for (const [inst, node] of this.nodes) {
      if (!live.has(inst) && (node.billboard || (this.bbLive && this.bbLive.has(inst)))) {
        node.el.remove();
        this.nodes.delete(inst);
      }
    }
    this.bbLive = live;
  }

  frame() {
    this.frameCount = (this.frameCount || 0) + 1;
    if (!this.preloaded && contentEra() === 2018) {
      this.preloaded = true;
      this.overlay.classList.add('ch-era-2018');
      for (const u of ['rbxasset://textures/ui/dialog_white.png', 'rbxasset://textures/ui/dialog_tail.png', 'rbxasset://textures/ui/dialog_purple.png', 'rbxasset://textures/ui/chatBubble_white_notify_bkg.png']) imageSrc(u);
    }
    this.layout();
    this.applyPendingFocus();
    this.updateBillboards();
    this.updateTags();
  }

  focusTextBox(inst, on) {
    const node = this.nodes.get(inst);
    if (!node) {
      if (on) this.pendingFocus = { inst, tries: 30 };
      else if (this.pendingFocus && this.pendingFocus.inst === inst) this.pendingFocus = null;
      return;
    }
    if (on) {
      if (this.touch) {
        node.el.classList.add('ch-g-box-typing');
        node.el.style.display = '';
      }
      node.el.focus();
      this.pendingFocus = document.activeElement === node.el ? null : { inst, tries: 30 };
    } else {
      if (this.pendingFocus && this.pendingFocus.inst === inst) this.pendingFocus = null;
      node.el.blur();
    }
  }

  applyPendingFocus() {
    const pf = this.pendingFocus;
    if (!pf) return;
    const node = this.nodes.get(pf.inst);
    if (node && !pf.inst.destroyed) node.el.focus();
    if ((node && document.activeElement === node.el) || --pf.tries <= 0 || pf.inst.destroyed) this.pendingFocus = null;
  }

  pointerOverGui(x, y) {
    const e = document.elementFromPoint(x, y);
    if (!e) return false;
    return !!e.closest('.ch-g') && !e.closest('canvas');
  }
}
