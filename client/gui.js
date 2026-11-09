import { brick } from '../shared/brickcolor.js';
import { loadImage, assetId, nineSlice, contentUrl } from './assets.js';

const STYLE_SLICES = {
  frame1: 'textures/chatBubble_botBlue_bkg', frame2: 'textures/blackBkg_square', frame3: 'textures/blackBkg_round',
  frame4: 'textures/chatBubble_botGreen_bkg', frame5: 'textures/chatBubble_botRed_bkg',
  button1: 'textures/ui/btn_red', button2: 'textures/ui/btn_grey', bubble: 'textures/chatBubble_white_bkg',
};

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 28, 32, 42, 60, 96];
const FONTS = ['Arial, Helvetica, sans-serif', 'Arial, Helvetica, sans-serif', 'Arial, Helvetica, sans-serif', '"Source Sans 3", "Segoe UI", Arial, sans-serif', '"Source Sans 3", "Segoe UI", Arial, sans-serif', '"Source Sans 3", "Segoe UI", Arial, sans-serif', '"Source Sans 3", "Segoe UI", Arial, sans-serif'];
const BOLD = new Set([0, 2, 4]);

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
function imageSrc(url) {
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
    });
    imageUrls.set(id, p);
  }
  return p;
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
      const bw = `${sl.top}px ${sl.right}px ${sl.bottom}px ${sl.left}px`;
      const bi = (x) => `url(${x.url}) ${x.top} ${x.right} ${x.bottom} ${x.left} fill stretch`;
      rules.push(`${sel}{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}`);
      rules.push(`${sel}::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-style:solid;border-width:${bw};border-image:${bi(sl)}}`);
      if (hover) rules.push(`${sel}.auto:hover::before{border-image:${bi(hover)}}`);
    })).then(() => {
      rules.push('.ch-bubble{isolation:isolate;padding:10px 14px;color:#1b1f27}');
      rules.push(`.ch-bubble::after{content:"";position:absolute;left:50%;bottom:-14px;width:26px;height:16px;transform:translateX(-50%);background:url(${contentUrl('textures/chatBubble_white_tail.png')}) center/contain no-repeat}`);
      sheet.textContent = rules.join('\n');
    });
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
    const b = el('div', 'ch-bubble', this.tags);
    b.textContent = msg;
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
    const [l, t, r, b] = this.world.guiInset || [0, 0, 0, 0];
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
      const as = sg.props.get('AbsoluteSize');
      if (!as || as[0] !== W || as[1] !== H) this.dm.setProp(sg, 'AbsoluteSize', [W, H]);
      const node = this.nodeFor(sg, this.screen);
      node.el.style.zIndex = String((sg.parent && sg.parent.ClassName === 'CoreGui' ? 1000 : 10) + (sg.props.get('DisplayOrder') || 0));
      live.add(sg);
      node.el.style.display = sg.props.get('Enabled') === false ? 'none' : '';
      node.el.style.inset = `${t}px ${r}px ${b}px ${l}px`;
      this.layoutChildren(sg, node, [l, t], [W, H], live, order++);
    }
    for (const [inst, node] of this.nodes) {
      if (!live.has(inst) && !node.billboard) {
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
    if (hintText) this.hint.textContent = hintText;
    this.message.hidden = !msgText;
    if (msgText) this.message.textContent = msgText;
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

  layoutChildren(parent, pnode, pPos, pSize, live, zBase) {
    for (const c of parent.children) {
      if (!c.isA('GuiObject')) continue;
      live.add(c);
      const node = this.nodeFor(c, pnode.el);
      const P = c.props;
      const sz = P.get('Size'), ps = P.get('Position');
      const cons = P.get('SizeConstraint');
      const rx = cons === 2 ? pSize[1] : pSize[0];
      const ry = cons === 1 ? pSize[0] : pSize[1];
      const w = Math.round(rx * sz[0] + sz[1]), h = Math.round(ry * sz[2] + sz[3]);
      const x = Math.round(pSize[0] * ps[0] + ps[1]), y = Math.round(pSize[1] * ps[2] + ps[3]);
      const abs = [pPos[0] + x, pPos[1] + y];
      P.set('AbsolutePosition', abs);
      P.set('AbsoluteSize', [w, h]);
      const st = node.el.style;
      if (!c.isA('GuiButton') && c.ClassName !== 'TextBox') node.el.classList.toggle('ch-g-pass', !P.get('Active'));
      const typing = this.touch && c.ClassName === 'TextBox' && this.focused === c;
      node.el.classList.toggle('ch-g-box-typing', typing);
      const visible = P.get('Visible') || typing;
      st.display = visible ? '' : 'none';
      if (!visible) continue;
      st.left = x + 'px';
      st.top = y + 'px';
      st.width = Math.max(0, w) + 'px';
      st.height = Math.max(0, h) + 'px';
      st.zIndex = String(P.get('ZIndex') || 1);
      st.overflow = P.get('ClipsDescendants') ? 'hidden' : 'visible';
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
        const url = P.get('Image');
        if (url !== node.imgUrl) {
          node.imgUrl = url;
          node.img.removeAttribute('src');
          node.img.style.visibility = 'hidden';
          imageSrc(url).then((u) => {
            if (u && node.imgUrl === url) {
              node.img.src = u;
              node.img.style.visibility = '';
            }
          });
        }
        this.imageRect(node, P, w, h);
        const ic = P.get('ImageColor3');
        node.img.style.opacity = String(1 - P.get('ImageTransparency'));
        node.img.style.filter = ic[0] < 0.99 || ic[1] < 0.99 || ic[2] < 0.99 ? `brightness(${(ic[0] + ic[1] + ic[2]) / 3})` : '';
      }
      this.layoutChildren(c, node, abs, [w, h], live);
    }
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

  styleText(c, node, w, h) {
    const P = c.props;
    const e = c.ClassName === 'TextBox' ? node.el : node.text;
    const font = P.get('Font') | 0;
    let px = FONT_SIZES[P.get('FontSize') | 0] || 12;
    const text = P.get('Text') ?? '';
    if (P.get('TextScaled')) px = Math.max(6, Math.min(100, Math.floor(Math.min(h * 0.85, (w / Math.max(1, text.length)) * 1.8))));
    const st = e.style;
    st.fontFamily = FONTS[font] || FONTS[0];
    st.fontWeight = BOLD.has(font) ? '700' : '400';
    st.fontSize = px + 'px';
    st.color = rgba(P.get('TextColor3'), P.get('TextTransparency'));
    const stroke = P.get('TextStrokeTransparency');
    st.textShadow = stroke < 1 ? `0 0 2px ${rgba(P.get('TextStrokeColor3'), stroke)}, 0 0 1px ${rgba(P.get('TextStrokeColor3'), stroke)}` : 'none';
    const wrap = P.get('TextWrapped') || P.get('TextWrap');
    st.whiteSpace = wrap ? 'pre-wrap' : 'pre';
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
    if (!this.measure) this.measure = document.createElement('canvas').getContext('2d');
    this.measure.font = `${st.fontWeight} ${px}px ${st.fontFamily}`;
    const lines = String(text).split('\n');
    P.set('TextBounds', [Math.max(...lines.map((l) => this.measure.measureText(l).width)), lines.length * px * 1.2]);
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
    for (const rec of this.world.chars.values()) {
      if (this.world.own && rec === this.world.own.rec) continue;
      const head = rec.model.findChild('Head');
      if (!head) continue;
      const cf = head.props.get('CFrame');
      const d = Math.hypot(cf[0] - camPos.x, cf[1] - camPos.y, cf[2] - camPos.z);
      if (d > 120) continue;
      const p = this.project([cf[0], cf[1] + 2.2, cf[2]]);
      if (!p) continue;
      seen.add(rec);
      let t = this.tagEls.get(rec);
      if (!t) {
        const box = el('div', 'ch-tag', this.tags);
        const n = el('div', 'ch-tag-name', box);
        const bar = el('div', 'ch-tag-bar', box);
        const fill = el('div', 'ch-tag-fill', bar);
        t = { box, n, bar, fill };
        this.tagEls.set(rec, t);
      }
      const name = rec.model.props.get('Name');
      if (t.n.textContent !== name) t.n.textContent = name;
      const h = rec.hum.props.get('Health'), mh = rec.hum.props.get('MaxHealth') || 100;
      t.bar.hidden = h >= mh;
      t.fill.style.width = Math.max(0, Math.min(100, (h / mh) * 100)) + '%';
      t.box.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)`;
    }
    for (const [rec, t] of this.tagEls) {
      if (!seen.has(rec)) {
        t.box.remove();
        this.tagEls.delete(rec);
      }
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
        b.el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, ${-100 - (b.stack || 0) * 110}%)`;
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
    if (this.frameCount % 15 === 0 || !this.bbList) {
      scan(ws);
      scan(pg);
      this.bbList = list;
    }
    const live = new Set();
    for (const bb of this.bbList) {
      if (bb.destroyed) continue;
      const ad = bb.props.get('Adornee') || (bb.parent && bb.parent.isA('BasePart') ? bb.parent : null);
      if (!ad || !ad.isA('BasePart') || bb.props.get('Enabled') === false) continue;
      const cf = ad.props.get('CFrame');
      const off = bb.props.get('StudsOffset');
      const p = this.project([cf[0] + off[0], cf[1] + off[1], cf[2] + off[2]]);
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
      if (node.billboard && !live.has(inst)) {
        node.el.remove();
        this.nodes.delete(inst);
      }
    }
  }

  frame() {
    this.frameCount = (this.frameCount || 0) + 1;
    this.layout();
    this.updateBillboards();
    this.updateTags();
  }

  focusTextBox(inst, on) {
    const node = this.nodes.get(inst);
    if (!node) return;
    if (on) {
      if (this.touch) {
        node.el.classList.add('ch-g-box-typing');
        node.el.style.display = '';
      }
      node.el.focus();
    } else node.el.blur();
  }

  pointerOverGui(x, y) {
    const e = document.elementFromPoint(x, y);
    if (!e) return false;
    return !!e.closest('.ch-g') && !e.closest('canvas');
  }
}
