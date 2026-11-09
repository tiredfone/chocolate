export function detectTouch() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && (navigator.maxTouchPoints || 0) > 0;
}

const TAP_MOVE = 12;
const TAP_TIME = 350;

export class TouchInput {
  constructor(world, renderer, gui, root, canvas) {
    this.world = world;
    this.renderer = renderer;
    this.gui = gui;
    this.root = root;
    this.canvas = canvas;
    this.dm = world.dm;
    this.active = new Map();
    const opts = { capture: true, passive: false };
    root.addEventListener('pointerdown', (e) => this.down(e), opts);
    window.addEventListener('pointermove', (e) => this.move(e), opts);
    window.addEventListener('pointerup', (e) => this.up(e, false), opts);
    window.addEventListener('pointercancel', (e) => this.up(e, true), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  isTouch(e) {
    return e.pointerType === 'touch' || e.pointerType === 'pen';
  }

  local(e) {
    const r = this.root.getBoundingClientRect();
    const k = this.world.guiScale ? this.world.guiScale() : 1;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }

  hits(x, y) {
    const out = [];
    let seq = 0;
    const walk = (inst, base, depth, parentVisible) => {
      for (const c of inst.children) {
        if (!c.isA('GuiObject')) continue;
        const P = c.props;
        if (!parentVisible || !P.get('Visible')) continue;
        const p = P.get('AbsolutePosition'), s = P.get('AbsoluteSize');
        const order = seq++;
        if (p && s && x >= p[0] && y >= p[1] && x < p[0] + s[0] && y < p[1] + s[1]) {
          out.push({ inst: c, key: [base, P.get('ZIndex') || 1, depth, order] });
        }
        walk(c, base, depth + 1, true);
      }
    };
    for (const sg of this.gui.screenGuis()) {
      if (sg.props.get('Enabled') === false) continue;
      const base = (sg.parent && sg.parent.ClassName === 'CoreGui' ? 1000 : 10) + (sg.props.get('DisplayOrder') || 0);
      walk(sg, base, 0, true);
    }
    out.sort((a, b) => {
      for (let i = 0; i < 4; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
      return 0;
    });
    return out.map((h) => h.inst);
  }

  emit(inst, name, ...args) {
    if (inst && !inst.destroyed) this.dm.emit(inst, name, ...args);
  }

  targets(rec, x, y) {
    const list = this.hits(x, y);
    for (const g of rec.began) if (!list.includes(g)) list.push(g);
    return list;
  }

  down(e) {
    if (!this.isTouch(e) || this.active.has(e.pointerId)) return;
    if (!this.world.ready) return;
    const [x, y] = this.local(e);
    const dm = this.dm;
    const io = dm.create('InputObject', null);
    io.props.set('Name', 'InputObject');
    io.props.set('UserInputType', 7);
    io.props.set('UserInputState', 0);
    io.props.set('Position', [x, y, 0]);
    io.props.set('Delta', [0, 0, 0]);
    const hits = this.hits(x, y);
    const processed = hits.some((g) => g.isA('GuiButton') || g.ClassName === 'TextBox' || g.props.get('Active'));
    const rec = { io, x, y, sx: x, sy: y, t0: performance.now(), began: hits, processed, moved: 0 };
    this.active.set(e.pointerId, rec);
    this.world.ensureAudio();
    if (this.gui.isTyping() && !(e.target && e.target.closest && e.target.closest('input,textarea'))) document.activeElement.blur();
    const uis = dm.services.get('UserInputService');
    this.emit(uis, 'TouchStarted', io, processed);
    this.emit(uis, 'InputBegan', io, processed);
    for (const g of hits) this.emit(g, 'InputBegan', io);
    this.emit(uis, 'ProcessedEvent', io, processed);
    if (!(e.target && e.target.closest && e.target.closest('input,textarea'))) e.preventDefault();
  }

  move(e) {
    const rec = this.active.get(e.pointerId);
    if (!rec) return;
    const [x, y] = this.local(e);
    if (x === rec.x && y === rec.y) return;
    const io = rec.io;
    io.props.set('Delta', [x - rec.x, y - rec.y, 0]);
    io.props.set('Position', [x, y, 0]);
    io.props.set('UserInputState', 1);
    rec.x = x;
    rec.y = y;
    rec.moved = Math.max(rec.moved, Math.hypot(x - rec.sx, y - rec.sy));
    const uis = this.dm.services.get('UserInputService');
    this.emit(uis, 'TouchMoved', io, rec.processed);
    this.emit(uis, 'InputChanged', io, rec.processed);
    for (const g of this.targets(rec, x, y)) this.emit(g, 'InputChanged', io);
    e.preventDefault();
  }

  up(e, cancelled) {
    const rec = this.active.get(e.pointerId);
    if (!rec) return;
    this.active.delete(e.pointerId);
    const [x, y] = this.local(e);
    const io = rec.io;
    io.props.set('Delta', [x - rec.x, y - rec.y, 0]);
    io.props.set('Position', [x, y, 0]);
    io.props.set('UserInputState', 2);
    const uis = this.dm.services.get('UserInputService');
    this.emit(uis, 'TouchEnded', io, rec.processed);
    this.emit(uis, 'InputEnded', io, rec.processed);
    for (const g of this.targets(rec, x, y)) this.emit(g, 'InputEnded', io);
    const tap = !cancelled && !rec.processed && rec.moved < TAP_MOVE && performance.now() - rec.t0 < TAP_TIME;
    if (tap) this.tap(x, y);
    setTimeout(() => this.dm.destroy && !io.destroyed && this.dm.destroy(io), 5000);
  }

  tap(x, y) {
    const world = this.world;
    const ms = world.mouseState;
    const r = this.root.getBoundingClientRect();
    const k = this.world.guiScale ? this.world.guiScale() : 1;
    ms.x = x / k;
    ms.y = y / k;
    ms.ndc = [(ms.x / r.width) * 2 - 1, -(ms.y / r.height) * 2 + 1];
    world.dm.emit(world.mouse, 'Move');
    world.updateMouse(this.renderer.pick(ms.ndc[0], ms.ndc[1]), this.renderer);
    world.mouseDown(0);
    setTimeout(() => {
      if (ms.down) world.mouseUp(0);
    }, 60);
  }
}
