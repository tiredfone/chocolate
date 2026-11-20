import * as THREE from 'three';
import * as C from '../shared/cframe.js';
import { parsePlace } from '../shared/rbxl.js';
import { makeSpawnLocation } from '../shared/services.js';
import { writePlace } from '../shared/rbxlx.js';
import { xmlToBinary } from '../shared/rbxlbin.js';
import { el } from './ui.js';
import { setEditorTheme } from './scripteditor.js';

const DB_NAME = 'chocolate-studio';
const STORE = 'autosaves';
const KEEP_SAVES = 3;
const SETTINGS_KEY = 'chocolate-studio-settings';

const SHORTCUTS = [
  ['Ctrl+S', 'Save in this browser'], ['Ctrl+Shift+S', 'Save to file (.rbxl)'], ['Alt+P', 'Publish to Solar'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+X / C / V', 'Cut, copy, paste'], ['Ctrl+Shift+V', 'Paste into the selection'],
  ['Ctrl+D', 'Duplicate'], ['Ctrl+A', 'Select all'], ['Ctrl+G / Ctrl+U', 'Group / Ungroup'], ['Ctrl+R / Ctrl+T', 'Rotate / Tilt'],
  ['Delete', 'Delete'], ['F2', 'Rename'], ['F', 'Focus the camera on the selection'], ['Ctrl+Shift+X', 'Filter the Explorer'],
  ['W A S D Q E', 'Fly the camera (Shift for speed)'], ['Right drag', 'Look around'], ['Middle drag', 'Pan'],
  ['Ctrl+F / F3 / Shift+F3', 'Find, find next, find previous (script)'], ['Ctrl+H', 'Replace (script)'], ['Ctrl+G', 'Go to line (script)'],
  ['Ctrl+Space', 'Autocomplete (script)'], ['Ctrl+Shift+F', 'Find in all scripts'],
];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll(placeId) {
  const db = await openDb();
  return new Promise((resolve) => {
    const out = [];
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return;
      if (c.value.place === placeId) out.push(c.value);
      c.continue();
    };
    tx.oncomplete = () => resolve(out.sort((a, b) => b.t - a.t));
    tx.onerror = () => resolve(out);
  });
}

async function dbPut(rec) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function dbDelete(key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

function recSize(r) {
  const d = r.data || r.xml;
  return d.length || d.byteLength || 0;
}

function loadSettings() {
  try {
    return { camSpeed: 1, autosave: 3, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { camSpeed: 1, autosave: 3 };
  }
}

export class Extras {
  constructor(app) {
    this.app = app;
    this.settings = loadSettings();
    this.toggles = new Set();
    this.findTerm = '';
    this.statsEl = null;
    this.axisEl = null;
    this.grid = null;
    this.markers = null;
    this.recorder = null;
    this.frames = 0;
    this.fpsT = 0;
    this.fps = 0;
    if (app.era === 2018) setTimeout(() => {
      if (!this.toggles.has('uieditor') && app.gui && app.gui.overlay) this.toggleUiEditor(true);
    }, 0);
    this.statsT = 0;
    this.markT = 0;
    this.autosaveTimer = setInterval(() => this.autosave(), 30000);
    this.lastAutosave = Date.now();
    this.applySettings();
  }

  applySettings() {
    if (this.app.view) this.app.view.speedScale = +this.settings.camSpeed || 1;
    document.documentElement.classList.toggle('st-dark', this.settings.theme === 'dark');
    setEditorTheme(this.settings.editorTheme);
  }

  editor() {
    const d = this.app.docs.get(this.app.activeDoc);
    return d && d.script ? d.ed : null;
  }

  handles(id) {
    return HANDLED.has(id) || id.startsWith('stats:');
  }

  enabled(id) {
    const ed = this.editor();
    switch (id) {
      case 'find': case 'findnext': case 'findprev': case 'replace': case 'gotoline': case 'comment': case 'uncomment': case 'togglecomment': case 'reloadscript': return !!ed;
      case 'record': return typeof MediaRecorder === 'function' && !!this.app.r.canvas.captureStream;
      case 'autosaves': return typeof indexedDB !== 'undefined';
      default: return true;
    }
  }

  checked(id) {
    if (id === 'record') return !!this.recorder;
    return this.toggles.has(id);
  }

  async exec(id) {
    const app = this.app;
    if (id.startsWith('stats:')) return this.toggleStats(id.slice(6));
    switch (id) {
      case 'new': return this.newPlace();
      case 'shortcuts': return this.showShortcuts();
      case 'studiosettings': return this.studioSettings();
      case 'logdump': return this.logDump();
      case 'find': return this.find();
      case 'findnext': return this.findStep(1);
      case 'findprev': return this.findStep(-1);
      case 'replace': return this.replace();
      case 'gotoline': return this.gotoLine();
      case 'comment': return this.comment('add');
      case 'uncomment': return this.comment('remove');
      case 'togglecomment': return this.comment('toggle');
      case 'reloadscript': {
        const ed = this.editor();
        if (ed) ed.reload();
        return;
      }
      case 'findall': return this.findAll();
      case 'showgrid': return this.toggleGrid();
      case 'axis': return this.toggleAxis();
      case 'record': return this.toggleRecord();
      case 'collisions': case 'emulator': case 'constraintdetails': case 'netsim': {
        if (this.toggles.has(id)) this.toggles.delete(id);
        else this.toggles.add(id);
        if (id === 'constraintdetails') this.markT = 0;
        if (id === 'emulator') app.print(this.toggles.has(id) ? 'Emulator on: Play Solo runs as a phone with touch controls' : 'Emulator off', 'info');
        if (id === 'netsim') app.print(this.toggles.has(id) ? 'Network Simulator on: the next Play Solo has 110-180 ms of lag each way' : 'Network Simulator off', 'info');
        return app.refreshUI();
      }
      case 'uieditor': return this.toggleUiEditor();
      case 'mute': {
        if (this.toggles.has('mute')) this.toggles.delete('mute');
        else this.toggles.add('mute');
        this.sendMute();
        return app.refreshUI();
      }
      case 'autosaves': return this.openAutosaves();
      case 'startpage': return this.startPage();
      case 'gameexplorer': return this.gameExplorer();
      default: return;
    }
  }

  frame(dt) {
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0;
      this.fpsT = 0;
    }
    if (this.statsEl) {
      this.statsT -= dt;
      if (this.statsT <= 0) {
        this.statsT = 0.5;
        this.drawStats();
      }
    }
    if (this.axisEl) this.drawAxis();
    if (this.toggles.has('uieditor')) this.markUiSelection();
    if (this.toggles.has('constraintdetails')) {
      this.markT -= dt;
      if (this.markT <= 0) {
        this.markT = 0.5;
        this.drawMarkers();
      }
    } else if (this.markers) {
      this.app.r.scene.remove(this.markers);
      this.markers = null;
    }
  }

  toggleUiEditor(quiet = false) {
    const app = this.app;
    const ov = app.gui.overlay;
    if (this.toggles.has('uieditor')) {
      this.toggles.delete('uieditor');
      ov.classList.remove('st-uiedit');
      if (this.uiOff) this.uiOff();
      this.uiOff = null;
      if (this.uiBox) this.uiBox.style.display = 'none';
      for (const e of ov.querySelectorAll('.st-uisel')) e.classList.remove('st-uisel');
      return app.refreshUI();
    }
    this.toggles.add('uieditor');
    ov.classList.add('st-uiedit');
    if (!this.uiBox) {
      const box = document.createElement('div');
      box.className = 'st-uibox';
      for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
        const k = document.createElement('div');
        k.className = 'st-uihandle st-uih-' + h;
        k.dataset.h = h;
        box.appendChild(k);
      }
      ov.appendChild(box);
      this.uiBox = box;
    }
    const guiAt = (x, y) => {
      for (const hit of document.elementsFromPoint(x, y)) {
        if (!ov.contains(hit) || hit.closest('.st-uibox')) continue;
        const n = hit.closest('.ch-g');
        const i = n && app.gui.elInst ? app.gui.elInst.get(n) : null;
        if (i && i.isA && i.isA('GuiObject')) return i;
      }
      return null;
    };
    const down = (e) => {
      if (e.button !== 0 || !app.gui.elInst) return;
      const handle = e.target.closest && e.target.closest('.st-uihandle');
      let inst = handle ? this.uiTarget() : guiAt(e.clientX, e.clientY);
      if (!inst) return;
      e.preventDefault();
      e.stopPropagation();
      if (!handle && !app.selection.has(inst)) app.select([inst]);
      this.uiDrag(inst, handle ? handle.dataset.h : null, e);
    };
    const key = (e) => {
      const inst = this.uiTarget();
      if (!inst || !e.key.startsWith('Arrow')) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      const before = inst.props.get('Position').slice();
      const after = [before[0], before[1] + dx, before[2], before[3] + dy];
      app.setPropRaw(inst, 'Position', after);
      app.record('Move GUI', () => app.setPropRaw(inst, 'Position', before.slice()), () => app.setPropRaw(inst, 'Position', after.slice()));
      app.selectionChanged();
    };
    const dbl = (e) => {
      const inst = guiAt(e.clientX, e.clientY);
      if (!inst || !inst.props.has('Text')) return;
      e.preventDefault();
      e.stopPropagation();
      this.uiEditText(inst);
    };
    ov.addEventListener('pointerdown', down, true);
    ov.addEventListener('dblclick', dbl, true);
    document.addEventListener('keydown', key, true);
    this.uiOff = () => {
      ov.removeEventListener('pointerdown', down, true);
      ov.removeEventListener('dblclick', dbl, true);
      document.removeEventListener('keydown', key, true);
      if (this.uiTextEnd) this.uiTextEnd(true);
      this.uiGuides(null, null);
    };
    if (!quiet) app.print('UI Editor on: click StarterGui objects in the viewport to select them, drag to move, drag a handle to resize, arrow keys nudge, hold Shift to snap to 10 pixels, hold Alt to stop snapping to the middle and edges, double-click text to edit it', 'info');
    app.refreshUI();
  }

  uiEditText(inst) {
    const app = this.app;
    const n = app.gui.nodes && app.gui.nodes.get(inst);
    if (!n || !n.el) return;
    if (this.uiTextEnd) this.uiTextEnd(false);
    const ov = app.gui.overlay;
    const r = n.el.getBoundingClientRect(), o = ov.getBoundingClientRect();
    const ta = document.createElement('textarea');
    ta.className = 'st-uitext';
    ta.spellcheck = false;
    ta.value = String(inst.props.get('Text') ?? '');
    Object.assign(ta.style, { left: r.left - o.left + 'px', top: r.top - o.top + 'px', width: Math.max(60, r.width) + 'px', height: Math.max(24, r.height) + 'px' });
    const before = ta.value;
    const finish = (cancel) => {
      if (this.uiTextEnd !== finish) return;
      this.uiTextEnd = null;
      ta.remove();
      if (cancel || inst.destroyed) return;
      const after = ta.value;
      if (after === before) return;
      app.setPropRaw(inst, 'Text', after);
      app.record('Edit Text', () => app.setPropRaw(inst, 'Text', before), () => app.setPropRaw(inst, 'Text', after));
      app.selectionChanged();
    };
    this.uiTextEnd = finish;
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(false); }
    });
    for (const t of ['keyup', 'keypress', 'pointerdown', 'dblclick']) ta.addEventListener(t, (ev) => ev.stopPropagation());
    ta.addEventListener('blur', () => finish(false));
    ov.appendChild(ta);
    ta.focus();
    ta.select();
  }

  uiGuides(x, y) {
    const ov = this.app.gui.overlay;
    if (!this.uiGuideEls) {
      if (x == null && y == null) return;
      const v = document.createElement('div'), h = document.createElement('div');
      v.className = 'st-uiguide st-uiguide-v';
      h.className = 'st-uiguide st-uiguide-h';
      ov.append(v, h);
      this.uiGuideEls = [v, h];
    }
    const [v, h] = this.uiGuideEls;
    const pr = this.uiGuideRect;
    v.style.display = x == null || !pr ? 'none' : 'block';
    h.style.display = y == null || !pr ? 'none' : 'block';
    if (pr && x != null) Object.assign(v.style, { left: x + 'px', top: pr.top + 'px', height: pr.height + 'px' });
    if (pr && y != null) Object.assign(h.style, { top: y + 'px', left: pr.left + 'px', width: pr.width + 'px' });
  }

  uiTarget() {
    const app = this.app;
    for (const inst of app.selection) if (inst.isA && inst.isA('GuiObject') && !inst.destroyed) return inst;
    return null;
  }

  uiParentSize(inst) {
    const p = inst.parent;
    const abs = p && p.props.has('AbsoluteSize') ? p.props.get('AbsoluteSize') : null;
    if (Array.isArray(abs) && abs[0] > 0 && abs[1] > 0) return abs;
    const r = this.app.gui.overlay.getBoundingClientRect();
    return [r.width || 1, r.height || 1];
  }

  uiDrag(inst, handle, e) {
    const app = this.app;
    const pos0 = inst.props.get('Position').slice(), size0 = inst.props.get('Size').slice();
    const ap = inst.props.has('AnchorPoint') ? inst.props.get('AnchorPoint') || [0, 0] : [0, 0];
    const [pw, ph] = this.uiParentSize(inst);
    const sx = e.clientX, sy = e.clientY;
    const useScale = (scale, offset) => offset === 0 && scale !== 0;
    const apply = (v, i, delta, parent, snap) => {
      const out = v.slice();
      if (useScale(v[i], v[i + 1])) {
        out[i] = v[i] + delta / parent;
        if (snap) out[i] = Math.round(out[i] * 100) / 100;
      } else {
        out[i + 1] = v[i + 1] + delta;
        out[i + 1] = snap ? Math.round(out[i + 1] / 10) * 10 : Math.round(out[i + 1]);
      }
      return out;
    };
    const target = e.target;
    try { target.setPointerCapture(e.pointerId); } catch {}
    const ov = app.gui.overlay, o = ov.getBoundingClientRect();
    const node = app.gui.nodes && app.gui.nodes.get(inst);
    const pnode = inst.parent && app.gui.nodes && app.gui.nodes.get(inst.parent);
    const r0 = node && node.el ? node.el.getBoundingClientRect() : null;
    const prr = pnode && pnode.el && pnode.el.getBoundingClientRect().width > 0 ? pnode.el.getBoundingClientRect() : o;
    this.uiGuideRect = { left: prr.left - o.left, top: prr.top - o.top, width: prr.width, height: prr.height };
    const SNAP = 6;
    const snapAxis = (start, size, pStart, pSize, d) => {
      const lines = [[pStart + pSize / 2, start + size / 2], [pStart, start], [pStart + pSize, start + size]];
      let best = null;
      for (const [line, at] of lines) {
        const off = line - (at + d);
        if (Math.abs(off) <= SNAP && (!best || Math.abs(off) < Math.abs(best.off))) best = { off, line };
      }
      return best;
    };
    const move = (ev) => {
      let dx = ev.clientX - sx, dy = ev.clientY - sy;
      const snap = ev.shiftKey;
      if (!handle) {
        let gx = null, gy = null;
        if (r0 && !ev.altKey) {
          const bx = snapAxis(r0.left, r0.width, prr.left, prr.width, dx);
          const by = snapAxis(r0.top, r0.height, prr.top, prr.height, dy);
          if (bx) { dx += bx.off; gx = bx.line - o.left; }
          if (by) { dy += by.off; gy = by.line - o.top; }
        }
        this.uiGuides(gx, gy);
        let p = apply(pos0, 0, dx, pw, snap && gx == null);
        p = apply(p, 2, dy, ph, snap && gy == null);
        app.setPropRaw(inst, 'Position', p);
        this.markUiSelection();
        return;
      }
      if (r0 && !ev.altKey) {
        let gx = null, gy = null;
        if (handle.includes('e')) { const b = snapAxis(r0.right, 0, prr.left, prr.width, dx); if (b) { dx += b.off; gx = b.line - o.left; } }
        if (handle.includes('w')) { const b = snapAxis(r0.left, 0, prr.left, prr.width, dx); if (b) { dx += b.off; gx = b.line - o.left; } }
        if (handle.includes('s')) { const b = snapAxis(r0.bottom, 0, prr.top, prr.height, dy); if (b) { dy += b.off; gy = b.line - o.top; } }
        if (handle.includes('n')) { const b = snapAxis(r0.top, 0, prr.top, prr.height, dy); if (b) { dy += b.off; gy = b.line - o.top; } }
        this.uiGuides(gx, gy);
      }
      let dw = 0, dh = 0, mx = 0, my = 0;
      if (handle.includes('e')) { dw = dx; mx = dx * ap[0]; }
      if (handle.includes('w')) { dw = -dx; mx = dx * (1 - ap[0]); }
      if (handle.includes('s')) { dh = dy; my = dy * ap[1]; }
      if (handle.includes('n')) { dh = -dy; my = dy * (1 - ap[1]); }
      let sz = apply(size0, 0, dw, pw, snap);
      sz = apply(sz, 2, dh, ph, snap);
      let p = apply(pos0, 0, mx, pw, false);
      p = apply(p, 2, my, ph, false);
      app.setPropRaw(inst, 'Size', sz);
      app.setPropRaw(inst, 'Position', p);
      this.markUiSelection();
    };
    const up = () => {
      this.uiGuides(null, null);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const pos1 = inst.props.get('Position').slice(), size1 = inst.props.get('Size').slice();
      const changed = pos0.some((v, i) => v !== pos1[i]) || size0.some((v, i) => v !== size1[i]);
      if (changed) {
        app.record(handle ? 'Resize GUI' : 'Move GUI', () => {
          app.setPropRaw(inst, 'Position', pos0.slice());
          app.setPropRaw(inst, 'Size', size0.slice());
        }, () => {
          app.setPropRaw(inst, 'Position', pos1.slice());
          app.setPropRaw(inst, 'Size', size1.slice());
        });
      }
      app.selectionChanged();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  markUiSelection() {
    const app = this.app;
    if (!app.gui.elInst) return;
    for (const e of app.gui.overlay.querySelectorAll('.st-uisel')) e.classList.remove('st-uisel');
    const inst = this.uiTarget();
    const n = inst && app.gui.nodes && app.gui.nodes.get(inst);
    if (!this.uiBox) return;
    if (!n || !n.el || !n.el.isConnected || n.el.offsetParent === null) {
      this.uiBox.style.display = 'none';
      return;
    }
    n.el.classList.add('st-uisel');
    const r = n.el.getBoundingClientRect(), o = app.gui.overlay.getBoundingClientRect();
    const st = this.uiBox.style;
    st.display = 'block';
    st.left = r.left - o.left + 'px';
    st.top = r.top - o.top + 'px';
    st.width = r.width + 'px';
    st.height = r.height + 'px';
  }

  playUrl(url) {
    const add = [];
    if (this.toggles.has('emulator')) add.push('touch=1');
    if (this.toggles.has('netsim')) add.push('netsim=1');
    return add.length ? `${url}${url.includes('?') ? '&' : '?'}${add.join('&')}` : url;
  }

  playClass() {
    return this.toggles.has('emulator') ? 'st-emulated' : '';
  }

  sendMute() {
    const d = this.app.docs.get('play');
    const w = d && d.ed.frame && d.ed.frame.contentWindow;
    if (w) w.postMessage({ chocolate: 'mute', on: this.toggles.has('mute') }, location.origin);
  }

  blocked(targets) {
    if (!this.toggles.has('collisions')) return false;
    const ph = this.app.ph;
    const R = ph.R;
    const skip = new Set(targets);
    for (const t of targets) {
      for (const p of [t, ...t.descendants()]) {
        if (!p.isA || !p.isA('BasePart') || !p.props.get('CanCollide')) continue;
        const s = p.props.get('Size'), cf = p.props.get('CFrame');
        const q = C.toQuat(cf);
        const shape = new R.Cuboid(Math.max(0.01, s[0] / 2 - 0.02), Math.max(0.01, s[1] / 2 - 0.02), Math.max(0.01, s[2] / 2 - 0.02));
        let hit = false;
        ph.world.intersectionsWithShape({ x: cf[0], y: cf[1], z: cf[2] }, { x: q[0], y: q[1], z: q[2], w: q[3] }, shape, (c) => {
          const rec = ph.byHandle.get(c.handle);
          const o = rec && rec.part;
          if (!o || skip.has(o) || [...skip].some((x) => o.isDescendantOf && o.isDescendantOf(x)) || !o.props.get('CanCollide')) return true;
          hit = true;
          return false;
        });
        if (hit) return true;
      }
    }
    return false;
  }

  async autosave() {
    const app = this.app;
    const every = Math.max(1, +this.settings.autosave || 3) * 60000;
    if (!app.dirty || Date.now() - this.lastAutosave < every || typeof indexedDB === 'undefined') return;
    this.lastAutosave = Date.now();
    try {
      const xml = writePlace(app.dm);
      const bytes = xmlToBinary(xml);
      const now = Date.now();
      await dbPut({ key: `${app.cfg.placeId}:${now}`, place: app.cfg.placeId, t: now, name: app.cfg.placeName || 'Place', data: bytes || xml });
      const all = (await dbAll(app.cfg.placeId)).filter((r) => !r.draft);
      for (const old of all.slice(KEEP_SAVES)) await dbDelete(old.key);
    } catch {}
  }

  async saveDraft(data) {
    if (typeof indexedDB === 'undefined') return false;
    const app = this.app;
    try {
      return await dbPut({ key: `${app.cfg.placeId}:draft`, place: app.cfg.placeId, t: Date.now(), name: app.cfg.placeName || 'Place', data, draft: true });
    } catch {
      return false;
    }
  }

  async openAutosaves() {
    const app = this.app;
    const list = await dbAll(app.cfg.placeId).catch(() => []);
    const pick = await app.ui.dialog('Auto-Saves', (body) => {
      if (!list.length) {
        el('div', null, body, 'There are no auto-saves for this place yet. Studio keeps the last three while you have unsaved changes.');
        return () => null;
      }
      const s = el('select', null, body);
      s.size = Math.min(6, list.length);
      s.style.width = '100%';
      for (const r of list) el('option', null, s, `${r.draft ? 'Saved: ' : ''}${new Date(r.t).toLocaleString()} (${Math.round(recSize(r) / 1024)} KB)`).value = r.key;
      s.value = list[0].key;
      el('div', null, body, 'Opening an auto-save replaces what is open now. Save afterwards to keep it.').style.marginTop = '6px';
      return () => s.value;
    }, list.length ? [['Open', true], ['Cancel', null]] : [['Close', null]]);
    const rec = list.find((r) => r.key === pick);
    if (!rec) return;
    app.replacePlace(parsePlace(rec.data || rec.xml), `the auto-save from ${new Date(rec.t).toLocaleString()}`);
  }

  async newPlace() {
    const app = this.app;
    const ok = await app.ui.confirm('New', 'Clear the Workspace and start again from a baseplate? You can undo this.');
    if (!ok) return;
    const ws = app.dm.services.get('Workspace');
    app.remove(ws.children.filter((c) => c.ClassName !== 'Camera' && c.ClassName !== 'Terrain'), 'New');
    const base = app.dm.create('Part', null);
    base.props.set('Name', 'Baseplate');
    for (const [k, v] of [['Anchored', true], ['Locked', true], ['Size', [512, 20, 512]], ['CFrame', [0, -10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]], ['BrickColor', 194]]) base.props.set(k, v);
    if (app.era !== 2018) {
      base.props.set('Size', [512, 1.2, 512]);
      base.props.set('CFrame', [0, -0.6, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      base.props.set('TopSurface', 3);
      base.props.set('BottomSurface', 4);
    } else {
      base.props.set('TopSurface', 0);
      base.props.set('BottomSurface', 0);
    }
    app.dm.setParent(base, ws);
    const spawn = makeSpawnLocation(app.dm, app.era === 2018 ? 2018 : 2012);
    app.dm.setParent(spawn, ws);
    app.add([base, spawn], 'New');
    app.view.frameAll();
  }

  showShortcuts() {
    return this.app.ui.dialog('Shortcuts', (body) => {
      const t = el('table', 'st-shortcuts', body);
      for (const [k, v] of SHORTCUTS) {
        const tr = el('tr', null, t);
        el('td', null, tr, k);
        el('td', null, tr, v);
      }
    });
  }

  async studioSettings() {
    const app = this.app;
    const next = await app.ui.dialog('Studio Settings', (body) => {
      const row = (label, input) => {
        const r = el('label', 'st-gs-field', body);
        el('span', null, r, label);
        r.appendChild(input);
        return input;
      };
      const speed = document.createElement('input');
      speed.type = 'number';
      speed.min = '0.25';
      speed.max = '4';
      speed.step = '0.25';
      speed.value = String(this.settings.camSpeed);
      row('Camera speed', speed);
      const auto = document.createElement('input');
      auto.type = 'number';
      auto.min = '1';
      auto.max = '30';
      auto.value = String(this.settings.autosave);
      row('Auto-save every (minutes)', auto);
      const studioTheme = document.createElement('select');
      for (const [v, l] of [['light', 'Light'], ['dark', 'Dark']]) el('option', null, studioTheme, l).value = v;
      studioTheme.value = this.settings.theme === 'dark' ? 'dark' : 'light';
      row('Studio theme', studioTheme);
      const theme = document.createElement('select');
      for (const [v, l] of [['auto', 'Match Studio'], ['dark', 'Dark'], ['light', 'Light']]) el('option', null, theme, l).value = v;
      theme.value = this.settings.editorTheme || 'auto';
      row('Script editor theme', theme);
      return () => ({ camSpeed: Math.max(0.25, Math.min(4, +speed.value || 1)), autosave: Math.max(1, Math.min(30, Math.round(+auto.value || 3))), editorTheme: theme.value, theme: studioTheme.value });
    }, [['OK', true], ['Cancel', null]]);
    if (!next) return;
    this.settings = { ...this.settings, ...next };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {}
    this.applySettings();
    app.print('Studio settings saved', 'info');
  }

  logDump() {
    const text = [...this.app.output.body.children].map((d) => d.textContent).join('\n');
    this.app.download(text, `${this.app.cfg.placeName || 'Studio'} log.txt`.replace(/[\\/:*?"<>|]/g, '_'));
  }

  async find() {
    const ed = this.editor();
    if (ed) ed.openFind();
  }

  findStep(dir) {
    const ed = this.editor();
    if (ed) ed.findNext(dir);
  }

  selectRange(ed, a, b) {
    ed.ta.focus();
    ed.ta.setSelectionRange(a, b);
  }

  async replace() {
    const ed = this.editor();
    if (ed) ed.openFind();
  }

  gotoLineNumber(n) {
    const ed = this.editor();
    if (!ed) return;
    const lines = ed.ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(n, lines.length) - 1; i++) pos += lines[i].length + 1;
    this.selectRange(ed, pos, pos + (lines[n - 1] || '').length);
  }

  async gotoLine() {
    const ed = this.editor();
    if (ed) ed.openGoto();
  }

  comment(mode) {
    const ed = this.editor();
    if (!ed) return;
    ed.unfold();
    const ta = ed.ta;
    const v = ta.value;
    const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let b = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), a));
    if (b < 0) b = v.length;
    const lines = v.slice(a, b).split('\n');
    const commented = lines.every((l) => !l.trim() || /^\s*--/.test(l));
    const add = mode === 'add' || (mode === 'toggle' && !commented);
    const out = lines.map((l) => (add ? (l.trim() ? '--' + l : l) : l.replace(/^(\s*)--/, '$1'))).join('\n');
    ta.focus();
    ta.setSelectionRange(a, b);
    ta.setRangeText(out, a, b, 'select');
    ta.dispatchEvent(new Event('input'));
  }

  async findAll() {
    const app = this.app;
    const term = await app.ui.prompt('Find All', 'Find in all scripts', this.findTerm);
    if (!term) return;
    this.findTerm = term;
    const t = term.toLowerCase();
    const hits = [];
    for (const d of app.dm.root.descendants()) {
      if (!['Script', 'LocalScript', 'ModuleScript'].includes(d.ClassName)) continue;
      const src = String(d.props.get('Source') || '');
      if (!src.toLowerCase().includes(t)) continue;
      src.split('\n').forEach((line, i) => {
        if (line.toLowerCase().includes(t) && hits.length < 500) hits.push([d, i + 1, line.trim()]);
      });
    }
    if (!this.findPane) {
      const body = app.ui.addPane('findresults', 'Find Results', 'bottom');
      this.findPane = el('div', 'st-findresults', body);
    }
    app.ui.togglePane('findresults', true);
    this.findPane.replaceChildren();
    el('div', 'info', this.findPane, `${hits.length} result${hits.length === 1 ? '' : 's'} for "${term}"`);
    for (const [script, line, text] of hits) {
      const r = el('div', 'st-findhit', this.findPane, `${script.fullName ? script.fullName() : script.props.get('Name')}:${line}  ${text.slice(0, 160)}`);
      r.addEventListener('click', () => {
        app.openScript(script);
        const ed = this.editor();
        if (!ed) return;
        const lines = ed.ta.value.split('\n');
        let pos = 0;
        for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
        this.selectRange(ed, pos, pos + (lines[line - 1] || '').length);
      });
    }
  }

  toggleGrid() {
    const r = this.app.r;
    if (this.grid) {
      r.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid = null;
      this.toggles.delete('showgrid');
    } else {
      const step = this.app.grid >= 1 ? this.app.grid * 4 : 4;
      this.grid = new THREE.GridHelper(step * 128, 128, 0x5a5a5a, 0x8a8a8a);
      this.grid.position.y = 0.02;
      this.grid.material.transparent = true;
      this.grid.material.opacity = 0.45;
      this.grid.material.depthWrite = false;
      r.scene.add(this.grid);
      this.toggles.add('showgrid');
    }
    this.app.refreshUI();
  }

  toggleAxis() {
    if (this.axisEl) {
      this.axisEl.remove();
      this.axisEl = null;
      this.toggles.delete('axis');
    } else {
      this.axisEl = el('canvas', 'st-axis', this.app.viewEl);
      this.axisEl.width = this.axisEl.height = 80;
      this.toggles.add('axis');
    }
    this.app.refreshUI();
  }

  drawAxis() {
    const g = this.axisEl.getContext('2d');
    const cam = this.app.r.camera;
    const q = cam.quaternion.clone().invert();
    g.clearRect(0, 0, 80, 80);
    const axes = [[new THREE.Vector3(1, 0, 0), '#e0342f', 'X'], [new THREE.Vector3(0, 1, 0), '#3aa83a', 'Y'], [new THREE.Vector3(0, 0, 1), '#2f6fe0', 'Z']];
    const pts = axes.map(([v, c, n]) => [v.clone().applyQuaternion(q), c, n]).sort((a, b) => a[0].z - b[0].z);
    for (const [v, c, n] of pts) {
      g.strokeStyle = c;
      g.fillStyle = c;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(40, 40);
      g.lineTo(40 + v.x * 28, 40 - v.y * 28);
      g.stroke();
      g.font = 'bold 12px Arial, sans-serif';
      g.fillText(n, 36 + v.x * 34, 44 - v.y * 34);
    }
  }

  toggleStats(kind) {
    if (kind === 'clear') {
      for (const k of [...this.toggles]) if (k.startsWith('stats:')) this.toggles.delete(k);
    } else {
      const k = 'stats:' + kind;
      if (this.toggles.has(k)) this.toggles.delete(k);
      else this.toggles.add(k);
    }
    const any = [...this.toggles].some((k) => k.startsWith('stats:'));
    if (any && !this.statsEl) this.statsEl = el('pre', 'st-stats', this.app.viewEl);
    if (!any && this.statsEl) {
      this.statsEl.remove();
      this.statsEl = null;
    }
    this.statsT = 0;
    this.app.refreshUI();
  }

  drawStats() {
    const app = this.app;
    const lines = [];
    const ws = app.dm.services.get('Workspace');
    const all = ws.descendants();
    if (this.toggles.has('stats:summary')) {
      lines.push(`FPS ${this.fps.toFixed(0)}`, `Instances ${app.dm.root.descendants().length}`, `Parts ${all.filter((d) => d.isA && d.isA('BasePart')).length}`, `Scripts ${app.dm.root.descendants().filter((d) => /Script$/.test(d.ClassName)).length}`);
      if (performance.memory) lines.push(`Memory ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`);
    }
    if (this.toggles.has('stats:render')) {
      const i = app.r.r.info;
      lines.push(`Draw calls ${i.render.calls}`, `Triangles ${i.render.triangles}`, `Geometries ${i.memory.geometries}`, `Textures ${i.memory.textures}`);
    }
    if (this.toggles.has('stats:physics')) {
      const parts = all.filter((d) => d.isA && d.isA('BasePart'));
      lines.push(`Colliders ${app.ph.world.colliders.len()}`, `Anchored ${parts.filter((p) => p.props.get('Anchored')).length}`, `Unanchored ${parts.filter((p) => !p.props.get('Anchored')).length}`, `Joints ${all.filter((d) => d.isA && d.isA('JointInstance')).length}`);
    }
    if (this.toggles.has('stats:network')) {
      const t = app.team;
      lines.push(t ? `Team Create ${t.open ? 'connected' : 'disconnected'}` : 'Team Create off');
      if (t) lines.push(`Editors ${t.users.length}`);
      lines.push(`Play Solo ${app.playing ? 'running' : 'off'}`);
    }
    this.statsEl.textContent = lines.join('\n');
  }

  toggleRecord() {
    const app = this.app;
    if (this.recorder) {
      this.recorder.stop();
      return;
    }
    const stream = app.r.canvas.captureStream(30);
    const type = ['video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      this.recorder = null;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      a.download = `${app.cfg.placeName || 'Studio'} recording.webm`.replace(/[\\/:*?"<>|]/g, '_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      app.print('Recording saved', 'info');
      app.refreshUI();
    };
    rec.start(1000);
    this.recorder = rec;
    app.print('Recording the viewport. Choose Video Record again to stop and download it.', 'info');
    app.refreshUI();
  }

  drawMarkers() {
    const app = this.app;
    if (!this.markers) {
      this.markers = new THREE.Group();
      app.r.scene.add(this.markers);
    }
    const g = this.markers;
    for (const c of [...g.children]) g.remove(c);
    if (!this.markerGeo) {
      this.markerGeo = new THREE.SphereGeometry(0.15, 8, 6);
      this.markerMat = new THREE.MeshBasicMaterial({ color: 0x2ecc40, depthTest: false });
      this.lineMat = new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false });
    }
    let n = 0;
    const where = (a) => {
      const p = a.parent;
      if (!p || !p.isA || !p.isA('BasePart')) return null;
      const w = C.mul(p.props.get('CFrame'), a.props.get('CFrame') || C.cf(0, 0, 0));
      return new THREE.Vector3(w[0], w[1], w[2]);
    };
    for (const d of app.dm.services.get('Workspace').descendants()) {
      if (n > 600) break;
      if (d.ClassName === 'Attachment') {
        const v = where(d);
        if (!v) continue;
        const m = new THREE.Mesh(this.markerGeo, this.markerMat);
        m.position.copy(v);
        m.renderOrder = 10;
        g.add(m);
        n++;
      } else if (/Constraint$/.test(d.ClassName) && d.info.all.has('Attachment0')) {
        const a0 = d.props.get('Attachment0'), a1 = d.props.get('Attachment1');
        const v0 = a0 && where(a0), v1 = a1 && where(a1);
        if (!v0 || !v1) continue;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v0, v1]), this.lineMat);
        line.renderOrder = 10;
        g.add(line);
        n++;
      }
    }
  }

  startPage() {
    const app = this.app;
    const id = 'start';
    if (!app.docs.has(id)) {
      const ed = new StartPage(app.ui.docs, app, this);
      app.docs.set(id, { ed });
      app.ui.tab(id, 'Start Page', () => app.showDoc(id), () => app.closeDoc(id));
    }
    app.showDoc(id);
  }

  gameExplorer() {
    const app = this.app;
    if (!this.gamePane) {
      const body = app.ui.addPane('gameexplorer', 'Game Explorer', 'right');
      this.gamePane = el('div', 'st-gameexplorer', body);
    }
    this.gamePane.replaceChildren();
    el('div', 'st-ge-head', this.gamePane, app.cfg.placeName || 'Place');
    const places = el('div', 'st-ge-group', this.gamePane, 'Places');
    const row = el('div', 'st-ge-row', places, `${app.cfg.placeName || 'Place'} (start place, ${app.era} client)`);
    row.title = `Place ${app.cfg.placeId}`;
    el('div', 'st-ge-group', this.gamePane, 'Developer Products: none');
    el('div', 'st-ge-group', this.gamePane, `Team Create: ${app.team ? 'on' : 'off'}`);
    const b = el('button', null, this.gamePane, 'Game Settings...');
    b.addEventListener('click', () => app.exec('gamesettings'));
    app.ui.togglePane('gameexplorer', true);
  }
}

class StartPage {
  constructor(parent, app, extras) {
    this.ta = { readOnly: false, blur() {} };
    this.el = el('div', 'st-startpage', parent);
    el('h2', null, this.el, app.cfg.placeName || 'Place');
    el('p', null, this.el, `Place ${app.cfg.placeId}. Plays in the ${app.era} client.`);
    const actions = el('div', 'st-sp-actions', this.el);
    for (const [cmd, label] of [['playsolo', 'Play'], ['teamtest', 'Team Test'], ['gamesettings', 'Game Settings'], ['save', 'Save'], ['publish', 'Publish'], ['autosaves', 'Auto-Saves'], ['shortcuts', 'Shortcuts']]) {
      const b = el('button', null, actions, label);
      b.addEventListener('click', () => app.exec(cmd));
    }
    this.recent = el('div', 'st-sp-recent', this.el);
    dbAll(app.cfg.placeId).then((list) => {
      if (!list.length) return;
      el('h3', null, this.recent, 'Auto-saves');
      for (const r of list) el('div', null, this.recent, new Date(r.t).toLocaleString());
    }).catch(() => {});
  }

  show(on) {
    this.el.hidden = !on;
  }

  reload() {}

  dispose() {
    this.el.remove();
  }
}

const HANDLED = new Set(['netsim', 'uieditor', 'new', 'shortcuts', 'studiosettings', 'logdump', 'find', 'findnext', 'findprev', 'replace', 'gotoline', 'comment', 'uncomment', 'togglecomment',
  'reloadscript', 'findall', 'showgrid', 'axis', 'record', 'collisions', 'emulator', 'constraintdetails', 'mute', 'autosaves', 'startpage', 'gameexplorer']);
