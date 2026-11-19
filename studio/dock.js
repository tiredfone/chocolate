const DOCKS = ['left', 'right', 'bottom'];
const MOVE_THRESHOLD = 5;
const ZONE = 150;

function node(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function inside(r, x, y) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export class Dock {
  constructor(ui) {
    this.ui = ui;
    this.key = 'chocolate-studio-layout-' + (ui.app.era === 2018 ? '2018' : '2012');
    this.counter = 0;
    this.zTop = 40;
    this.saved = this.read();
    this.drag = null;
    this.pending = null;
    this.watch = new ResizeObserver(() => this.queueSave());
  }

  read() {
    try {
      const j = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (j && j.v === 1 && j.panes && typeof j.panes === 'object') return j;
    } catch {}
    return { v: 1, panes: {}, sizes: {} };
  }

  write(data) {
    try {
      if (data) localStorage.setItem(this.key, JSON.stringify(data));
      else localStorage.removeItem(this.key);
    } catch {}
  }

  adopt(pane) {
    pane.order = ++this.counter * 10;
    pane.home = { dock: pane.dock, order: pane.order };
    pane.tabOf = null;
    pane.float = null;
    const s = this.saved.panes[pane.id];
    if (s && (DOCKS.includes(s.dock) || s.dock === 'float')) {
      pane.dock = s.dock;
      pane.order = Number.isFinite(s.order) ? s.order : pane.order;
      pane.tabOf = typeof s.tabOf === 'string' ? s.tabOf : null;
      pane.float = s.float && Number.isFinite(s.float.x) ? { x: s.float.x, y: s.float.y, w: s.float.w || 320, h: s.float.h || 260 } : null;
      if (pane.dock === 'float' && !pane.float) pane.float = { x: 120, y: 120, w: 320, h: 260 };
    }
    const cap = pane.el.querySelector('.st-pane-caption');
    cap.addEventListener('pointerdown', (e) => this.press(pane, e));
    pane.el.addEventListener('pointerdown', () => this.raise(pane), true);
  }

  leaderOf(pane) {
    if (!pane.tabOf) return pane;
    const l = this.ui.panes.get(pane.tabOf);
    return l && l !== pane && !l.tabOf ? l : pane;
  }

  groups(dock) {
    const all = [...this.ui.panes.values()];
    const leads = all.filter((p) => p.dock === dock && this.leaderOf(p) === p).sort((a, b) => a.order - b.order);
    return leads.map((lead) => {
      const members = [lead, ...all.filter((p) => p !== lead && this.leaderOf(p) === lead).sort((a, b) => a.order - b.order)];
      const open = members.filter((m) => !m.closed);
      let vis = open.find((m) => m.id === lead.activeTab) || open[0] || null;
      if (vis) lead.activeTab = vis.id;
      return { lead, members, open, vis };
    });
  }

  allGroups() {
    return [...DOCKS, 'float'].flatMap((d) => this.groups(d));
  }

  layout() {
    const ui = this.ui;
    const vw = window.innerWidth, vh = window.innerHeight;
    const vis = new Set();
    const byDock = {};
    for (const d of [...DOCKS, 'float']) {
      byDock[d] = this.groups(d);
      for (const g of byDock[d]) if (g.vis) vis.add(g.vis);
    }
    for (const p of ui.panes.values()) {
      p.el.hidden = !vis.has(p);
      if (p.dock !== 'float' || !vis.has(p)) this.unfloat(p.el);
      if (!p.el.parentNode) ui[DOCKS.includes(p.dock) ? p.dock : 'right'].appendChild(p.el);
      if (!vis.has(p)) this.watch.unobserve(p.el);
    }
    for (const d of DOCKS) {
      const container = ui[d];
      const want = byDock[d].map((g) => g.vis).filter(Boolean);
      const cur = [...container.children].filter((c) => !c.hidden);
      if (cur.length !== want.length || want.some((p, i) => cur[i] !== p.el)) for (const p of want) container.appendChild(p.el);
    }
    for (const g of byDock.float) {
      if (!g.vis) continue;
      const m = g.vis;
      const f = g.lead.float || (g.lead.float = { x: 120, y: 120, w: 320, h: 260 });
      f.x = Math.max(-f.w + 80, Math.min(vw - 80, f.x));
      f.y = Math.max(0, Math.min(vh - 40, f.y));
      m.el.classList.add('st-floating');
      if (m.el.parentNode !== ui.root) ui.root.appendChild(m.el);
      m.el.style.left = f.x + 'px';
      m.el.style.top = f.y + 'px';
      m.el.style.width = f.w + 'px';
      m.el.style.height = f.h + 'px';
      if (!m.el.style.zIndex) m.el.style.zIndex = String(++this.zTop);
      this.watch.observe(m.el);
    }
    this.captions();
    const sizes = this.saved.sizes || {};
    for (const d of DOCKS) {
      const c = ui[d];
      const v = sizes[d];
      if (Number.isFinite(v) && !c.dataset.sized) {
        c.style[d === 'bottom' ? 'height' : 'width'] = v + 'px';
        c.dataset.sized = '1';
      }
      c.style.display = [...c.children].some((x) => !x.hidden) ? '' : 'none';
    }
  }

  unfloat(e) {
    e.classList.remove('st-floating');
    for (const k of ['left', 'top', 'width', 'height', 'zIndex']) e.style[k] = '';
  }

  paneOfEl(e) {
    for (const p of this.ui.panes.values()) if (p.el === e) return p;
    return null;
  }

  captions() {
    for (const g of this.allGroups()) {
      for (const m of g.members) {
        const t = m.titleEl;
        if (!t) continue;
        const tabbed = g.open.length > 1 && m === g.vis;
        t.replaceChildren();
        t.classList.toggle('tabbed', tabbed);
        if (!tabbed) {
          t.textContent = m.title;
          continue;
        }
        for (const x of g.open) {
          const tab = node('span', 'st-pane-tab' + (x === g.vis ? ' active' : ''), t, x.title);
          tab.dataset.pane = x.id;
        }
      }
    }
  }

  activate(pane) {
    const lead = this.leaderOf(pane);
    lead.activeTab = pane.id;
    this.layout();
    this.ui.app.resized();
    this.queueSave();
  }

  raise(pane) {
    if (pane.dock !== 'float') return;
    pane.el.style.zIndex = String(++this.zTop);
  }

  press(pane, e) {
    if (e.button !== 0 || this.ui.mobile() || e.target.closest('.st-close')) return;
    const tab = e.target.closest('.st-pane-tab');
    const target = tab ? this.ui.panes.get(tab.dataset.pane) || pane : pane;
    const r = target.el.getBoundingClientRect();
    this.pending = { pane: target, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, id: e.pointerId, cap: e.currentTarget, tab: !!tab };
    const move = (ev) => this.move(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.release(ev, ev.type === 'pointercancel');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  move(e) {
    const p = this.pending;
    if (!p) return;
    if (!this.drag) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < MOVE_THRESHOLD) return;
      this.begin(p);
    }
    this.update(e);
  }

  begin(p) {
    const ui = this.ui;
    const zones = {};
    const body = ui.left.parentNode.getBoundingClientRect();
    const center = ui.docs.parentNode.getBoundingClientRect();
    const rects = {
      left: { left: body.left, top: body.top, right: body.left + ZONE, bottom: body.bottom },
      right: { left: body.right - ZONE, top: body.top, right: body.right, bottom: body.bottom },
      bottom: { left: center.left + ZONE, top: center.bottom - 110, right: center.right - ZONE, bottom: center.bottom },
    };
    for (const d of DOCKS) {
      const z = node('div', 'st-dropzone ' + d, document.body);
      const r = rects[d];
      z.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
      zones[d] = z;
    }
    const mark = node('div', 'st-dropzone target', document.body);
    mark.hidden = true;
    const ghost = node('div', 'st-drag-ghost', document.body, p.pane.title);
    ui.root.classList.add('st-dragging');
    this.drag = { ...p, zones, rects, mark, ghost, drop: null, wasFloat: p.pane.dock === 'float' };
    if (this.drag.wasFloat) ghost.hidden = true;
  }

  visiblePanes(except) {
    const out = [];
    for (const g of this.allGroups()) {
      if (g.vis && g.vis !== except && g.lead !== this.leaderOf(except) && !g.vis.el.hidden) out.push(g.vis);
    }
    const floats = out.filter((p) => p.dock === 'float').sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
    return [...floats, ...out.filter((p) => p.dock !== 'float')];
  }

  update(e) {
    const d = this.drag;
    const x = e.clientX, y = e.clientY;
    d.ghost.style.left = x + 12 + 'px';
    d.ghost.style.top = y + 12 + 'px';
    if (d.wasFloat) {
      const el = d.pane.el;
      const f = this.leaderOf(d.pane).float;
      f.x = x - d.ox;
      f.y = y - d.oy;
      el.style.left = f.x + 'px';
      el.style.top = f.y + 'px';
    }
    let drop = null;
    for (const p of this.visiblePanes(d.pane)) {
      const r = p.el.getBoundingClientRect();
      if (!inside(r, x, y)) continue;
      const horizontal = p.dock === 'bottom';
      const rel = horizontal ? (x - r.left) / r.width : (y - r.top) / r.height;
      if (p.dock !== 'float' && rel < 0.22) drop = { kind: 'before', pane: p, rect: horizontal ? { left: r.left, top: r.top, width: r.width * 0.5, height: r.height } : { left: r.left, top: r.top, width: r.width, height: r.height * 0.5 } };
      else if (p.dock !== 'float' && rel > 0.78) drop = { kind: 'after', pane: p, rect: horizontal ? { left: r.left + r.width * 0.5, top: r.top, width: r.width * 0.5, height: r.height } : { left: r.left, top: r.top + r.height * 0.5, width: r.width, height: r.height * 0.5 } };
      else drop = { kind: 'tab', pane: p, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
      break;
    }
    if (!drop) {
      for (const k of DOCKS) {
        if (inside(d.rects[k], x, y)) {
          const r = d.rects[k];
          drop = { kind: 'dock', dock: k, rect: { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top } };
          break;
        }
      }
    }
    if (!drop) drop = { kind: 'float' };
    d.drop = drop;
    for (const k of DOCKS) d.zones[k].classList.toggle('hot', drop.kind === 'dock' && drop.dock === k);
    d.mark.hidden = !drop.rect || drop.kind === 'dock';
    if (drop.rect) {
      d.mark.style.cssText = `left:${drop.rect.left}px;top:${drop.rect.top}px;width:${drop.rect.width}px;height:${drop.rect.height}px`;
    }
    d.ghost.classList.toggle('floating', drop.kind === 'float');
    if (!d.wasFloat) d.ghost.textContent = drop.kind === 'float' ? d.pane.title + ' (float)' : drop.kind === 'tab' ? d.pane.title + ' (tab)' : d.pane.title;
  }

  release(e, cancel) {
    const p = this.pending;
    this.pending = null;
    const d = this.drag;
    this.drag = null;
    if (!p) return;
    if (!d) {
      if (p.tab && !cancel) this.activate(p.pane);
      return;
    }
    for (const z of Object.values(d.zones)) z.remove();
    d.mark.remove();
    d.ghost.remove();
    this.ui.root.classList.remove('st-dragging');
    if (cancel) {
      this.layout();
      return;
    }
    const drop = d.drop || { kind: 'float' };
    this.apply(d.pane, drop, e, d);
  }

  detach(pane) {
    const followers = [...this.ui.panes.values()].filter((p) => p !== pane && p.tabOf === pane.id).sort((a, b) => a.order - b.order);
    if (!pane.tabOf && followers.length) {
      const lead = followers[0];
      lead.tabOf = null;
      lead.dock = pane.dock;
      lead.order = pane.order;
      lead.float = pane.float ? { ...pane.float } : null;
      lead.activeTab = lead.id;
      for (const f of followers.slice(1)) f.tabOf = lead.id;
    }
    pane.tabOf = null;
  }

  apply(pane, drop, e, d) {
    const hadFloat = pane.dock === 'float';
    const oldRect = pane.float ? { ...pane.float } : null;
    const view = pane.el.getBoundingClientRect();
    this.detach(pane);
    pane.el.style.zIndex = '';
    if (drop.kind === 'tab') {
      const lead = this.leaderOf(drop.pane);
      pane.dock = lead.dock;
      pane.tabOf = lead.id;
      pane.float = null;
      pane.order = ++this.counter * 10;
      lead.activeTab = pane.id;
    } else if (drop.kind === 'dock') {
      pane.dock = drop.dock;
      pane.float = null;
      pane.order = ++this.counter * 10;
    } else if (drop.kind === 'before' || drop.kind === 'after') {
      const lead = this.leaderOf(drop.pane);
      pane.dock = lead.dock;
      pane.float = null;
      const list = this.groups(lead.dock).map((g) => g.lead).filter((l) => l !== pane);
      const i = list.indexOf(lead) + (drop.kind === 'after' ? 1 : 0);
      list.splice(i, 0, pane);
      list.forEach((l, k) => {
        l.order = k * 10 + 5;
      });
    } else {
      pane.dock = 'float';
      pane.tabOf = null;
      const w = oldRect ? oldRect.w : Math.max(260, Math.min(480, view.width));
      const h = oldRect ? oldRect.h : Math.max(180, Math.min(420, view.height));
      pane.float = hadFloat && oldRect ? { x: oldRect.x, y: oldRect.y, w, h } : { x: e.clientX - d.ox, y: e.clientY - d.oy, w, h };
      pane.activeTab = pane.id;
    }
    this.layout();
    this.ui.app.resized();
    this.save();
  }

  floatSizes() {
    for (const g of this.groups('float')) {
      if (!g.vis || g.vis.el.hidden) continue;
      const r = g.vis.el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40 && g.lead.float) {
        g.lead.float.w = Math.round(r.width);
        g.lead.float.h = Math.round(r.height);
      }
    }
  }

  queueSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 400);
  }

  save() {
    clearTimeout(this.timer);
    this.floatSizes();
    const data = { v: 1, panes: {}, sizes: {} };
    for (const p of this.ui.panes.values()) {
      data.panes[p.id] = { dock: p.dock, order: p.order, tabOf: p.tabOf || null, float: p.dock === 'float' && this.leaderOf(p) === p ? p.float : null };
    }
    for (const dk of DOCKS) {
      const c = this.ui[dk];
      const v = dk === 'bottom' ? c.style.height : c.style.width;
      if (v) data.sizes[dk] = parseInt(v, 10) || undefined;
    }
    this.saved = data;
    this.write(data);
  }

  reset() {
    for (const p of this.ui.panes.values()) {
      p.dock = p.home.dock;
      p.order = p.home.order;
      p.tabOf = null;
      p.float = null;
      p.activeTab = null;
      this.unfloat(p.el);
    }
    for (const dk of DOCKS) {
      const c = this.ui[dk];
      c.style.width = '';
      c.style.height = '';
      delete c.dataset.sized;
    }
    this.saved = { v: 1, panes: {}, sizes: {} };
    this.write(null);
    this.layout();
    this.ui.app.resized();
  }
}
