import * as THREE from 'three';
import * as C from '../shared/cframe.js';
import { parsePlace } from '../shared/rbxl.js';
import { writePlace } from '../shared/rbxlx.js';
import { el } from './ui.js';

const DB_NAME = 'chocolate-studio';
const STORE = 'autosaves';
const KEEP_SAVES = 3;
const SETTINGS_KEY = 'chocolate-studio-settings';

const SHORTCUTS = [
  ['Ctrl+S', 'Save'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+X / C / V', 'Cut, copy, paste'], ['Ctrl+Shift+V', 'Paste into the selection'],
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
    this.statsT = 0;
    this.markT = 0;
    this.autosaveTimer = setInterval(() => this.autosave(), 30000);
    this.lastAutosave = Date.now();
    this.applySettings();
  }

  applySettings() {
    if (this.app.view) this.app.view.speedScale = +this.settings.camSpeed || 1;
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

  toggleUiEditor() {
    const app = this.app;
    const ov = app.gui.overlay;
    if (this.toggles.has('uieditor')) {
      this.toggles.delete('uieditor');
      ov.classList.remove('st-uiedit');
      if (this.uiOff) this.uiOff();
      this.uiOff = null;
      for (const e of ov.querySelectorAll('.st-uisel')) e.classList.remove('st-uisel');
      return app.refreshUI();
    }
    this.toggles.add('uieditor');
    ov.classList.add('st-uiedit');
    const down = (e) => {
      if (e.button !== 0 || !app.gui.elInst) return;
      let node = null, inst = null;
      for (const hit of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (!ov.contains(hit)) continue;
        const n = hit.closest('.ch-g');
        const i = n ? app.gui.elInst.get(n) : null;
        if (i && i.isA && i.isA('GuiObject')) {
          node = n;
          inst = i;
          break;
        }
      }
      if (!inst) return;
      e.preventDefault();
      e.stopPropagation();
      app.select([inst]);
      const r = node.getBoundingClientRect();
      const resize = e.clientX > r.right - 12 && e.clientY > r.bottom - 12;
      const pos0 = inst.props.get('Position').slice(), size0 = inst.props.get('Size').slice();
      const sx = e.clientX, sy = e.clientY;
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const snap = (v) => (ev.shiftKey ? Math.round(v / 10) * 10 : Math.round(v));
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resize) app.setPropRaw(inst, 'Size', [size0[0], snap(size0[1] + dx), size0[2], snap(size0[3] + dy)]);
        else app.setPropRaw(inst, 'Position', [pos0[0], snap(pos0[1] + dx), pos0[2], snap(pos0[3] + dy)]);
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        const key = resize ? 'Size' : 'Position';
        const before = resize ? size0 : pos0, after = inst.props.get(key).slice();
        if (before.some((v, i) => v !== after[i])) app.record(resize ? 'Resize GUI' : 'Move GUI', () => app.setPropRaw(inst, key, before.slice()), () => app.setPropRaw(inst, key, after.slice()));
        app.selectionChanged();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
    };
    ov.addEventListener('pointerdown', down, true);
    this.uiOff = () => ov.removeEventListener('pointerdown', down, true);
    app.print('UI Editor on: drag StarterGui objects in the viewport to move them, drag their bottom-right corner to resize, hold Shift to snap to 10 pixels', 'info');
    app.refreshUI();
  }

  markUiSelection() {
    const app = this.app;
    if (!app.gui.elInst) return;
    for (const e of app.gui.overlay.querySelectorAll('.st-uisel')) e.classList.remove('st-uisel');
    for (const inst of app.selection) {
      const n = app.gui.nodes && app.gui.nodes.get(inst);
      if (n && n.el) n.el.classList.add('st-uisel');
    }
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
      const now = Date.now();
      await dbPut({ key: `${app.cfg.placeId}:${now}`, place: app.cfg.placeId, t: now, name: app.cfg.placeName || 'Place', xml });
      const all = await dbAll(app.cfg.placeId);
      for (const old of all.slice(KEEP_SAVES)) await dbDelete(old.key);
    } catch {}
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
      for (const r of list) el('option', null, s, `${new Date(r.t).toLocaleString()} (${Math.round(r.xml.length / 1024)} KB)`).value = r.key;
      s.value = list[0].key;
      el('div', null, body, 'Opening an auto-save replaces what is open now. Save afterwards to keep it.').style.marginTop = '6px';
      return () => s.value;
    }, list.length ? [['Open', true], ['Cancel', null]] : [['Close', null]]);
    const rec = list.find((r) => r.key === pick);
    if (!rec) return;
    app.replacePlace(parsePlace(rec.xml), `the auto-save from ${new Date(rec.t).toLocaleString()}`);
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
    app.add([base], 'New');
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
      return () => ({ camSpeed: Math.max(0.25, Math.min(4, +speed.value || 1)), autosave: Math.max(1, Math.min(30, Math.round(+auto.value || 3))) });
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
    if (!ed) return;
    const sel = ed.ta.value.slice(ed.ta.selectionStart, ed.ta.selectionEnd);
    const term = await this.app.ui.prompt('Find', 'Find what', sel && !sel.includes('\n') ? sel : this.findTerm);
    if (!term) return;
    this.findTerm = term;
    this.findStep(1);
  }

  findStep(dir) {
    const ed = this.editor();
    if (!ed || !this.findTerm) return this.find();
    const text = ed.ta.value;
    const lower = text.toLowerCase(), term = this.findTerm.toLowerCase();
    let i;
    if (dir > 0) {
      i = lower.indexOf(term, ed.ta.selectionEnd);
      if (i < 0) i = lower.indexOf(term);
    } else {
      i = lower.lastIndexOf(term, Math.max(0, ed.ta.selectionStart - 1));
      if (i < 0) i = lower.lastIndexOf(term);
    }
    if (i < 0) return this.app.ui.status(`"${this.findTerm}" was not found`);
    this.selectRange(ed, i, i + term.length);
  }

  selectRange(ed, a, b) {
    ed.ta.focus();
    ed.ta.setSelectionRange(a, b);
    const line = ed.ta.value.slice(0, a).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(ed.ta).lineHeight) || 15;
    ed.code.scrollTop = Math.max(0, line * lh - ed.code.clientHeight / 2);
  }

  async replace() {
    const ed = this.editor();
    if (!ed) return;
    ed.unfold();
    const r = await this.app.ui.dialog('Replace', (body) => {
      const f = el('input', null, body);
      f.placeholder = 'Find what';
      f.value = this.findTerm;
      const t = el('input', null, body);
      t.placeholder = 'Replace with';
      t.style.marginTop = '6px';
      for (const i of [f, t]) i.style.width = '100%';
      return () => ({ find: f.value, with: t.value });
    }, [['Replace All', true], ['Cancel', null]]);
    if (!r || !r.find) return;
    this.findTerm = r.find;
    const esc = r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = ed.ta.value;
    let n = 0;
    const after = before.replace(new RegExp(esc, 'gi'), () => {
      n++;
      return r.with;
    });
    if (!n) return this.app.ui.status(`"${r.find}" was not found`);
    ed.ta.focus();
    ed.ta.select();
    ed.ta.setRangeText(after, 0, before.length, 'start');
    ed.ta.dispatchEvent(new Event('input'));
    this.app.ui.status(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`);
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
    if (!ed) return;
    const lines = ed.ta.value.split('\n');
    const v = await this.app.ui.prompt('Go To Line', `Line number (1-${lines.length})`, '');
    const n = Math.max(1, Math.min(lines.length, parseInt(v, 10) || 0));
    if (!v) return;
    let pos = 0;
    for (let i = 0; i < n - 1; i++) pos += lines[i].length + 1;
    this.selectRange(ed, pos, pos);
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
    for (const [cmd, label] of [['playsolo', 'Play'], ['teamtest', 'Team Test'], ['gamesettings', 'Game Settings'], ['publish', 'Save'], ['autosaves', 'Auto-Saves'], ['shortcuts', 'Shortcuts']]) {
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
