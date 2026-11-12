import * as C from '../shared/cframe.js';
import { isCreatable, isService, ENUMS } from '../shared/classes.js';
import { parsePlace } from '../shared/rbxl.js';
import { writePlace, writeModel } from '../shared/rbxlx.js';
import { endpointUrl, assetBytes } from '../client/assets.js';
import { UI, SELECTION_MENU, el } from './ui.js';
import { UI2018 } from './ui2018.js';
import { Explorer, Properties, Output, Toolbox, ScriptEditor, brickPicker, creatableClasses } from './panes.js';
import { StudioView, partsOf, boundsOf } from './view.js';
import { ObjectBrowser } from './browser.js';
import { Gui } from '../client/gui.js';

const TOOLS = ['drag', 'axis', 'resize', 'lock', 'anchor', 'paint', 'dropper', 'material', 'move', 'rotate', 'size', 'surface0', 'surface1', 'surface2', 'surface3', 'surface4', 'surface5', 'surface6', 'surface7'];
const SERVICES = ['Workspace', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'Debris'];

class StudioGui extends Gui {
  constructor(root, dm, renderer) {
    super(root, { dm, player: null, guiInset: [0, 0, 0, 0], guiScale: () => 1, touch: false }, renderer, { send: () => {} });
    this.overlay.classList.add('st-gui');
    this.dm = Object.create(dm, {
      setProp: {
        value: (inst, name, v, o) => {
          if (name === 'AbsoluteSize' || name === 'AbsolutePosition') {
            inst.props.set(name, v);
            return true;
          }
          return dm.setProp(inst, name, v, o);
        },
      },
    });
  }

  screenGuis() {
    const sg = this.dm.services.get('StarterGui');
    if (!sg || sg.props.get('ShowDevelopmentGui') === false) return [];
    return sg.children.filter((c) => c.isA('ScreenGui'));
  }
}

function cloneVal(v) {
  return Array.isArray(v) ? v.slice() : v;
}

export class Studio {
  constructor({ root, dm, renderer, physics, cfg }) {
    this.dm = dm;
    this.r = renderer;
    this.ph = physics;
    this.cfg = cfg;
    this.selection = new Set();
    this.lastSelected = null;
    this.tool = 'drag';
    this.grid = 1;
    this.paintColor = 194;
    this.paintMaterial = 512;
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this.dirty = false;
    this.docs = new Map();
    this.activeDoc = 'place';
    this.era = cfg.clientVersion === 2018 ? 2018 : 2012;
    this.rotateGrid = this.era === 2018 ? 15 : 0;
    this.lastGrid = 1;
    this.ui = this.era === 2018 ? new UI2018(root, this) : new UI(root, this);
    this.explorer = new Explorer(this, this.ui.addPane('explorer', 'Explorer', 'right'));
    this.props = new Properties(this, this.ui.addPane('properties', 'Properties', 'right'));
    this.objects = new Toolbox(this, this.ui.addPane('objects', 'Toolbox', 'left'));
    this.output = new Output(this.ui.addPane('output', 'Output', 'bottom'));
    this.ui.panes.get('objects').closed = false;
    this.viewEl = el('div', 'st-viewport', this.ui.docs);
    this.viewEl.appendChild(renderer.canvas);
    this.view = new StudioView(this, this.viewEl, renderer, physics);
    this.gui = new StudioGui(this.viewEl, this.dm, renderer);
    this.ui.tab('place', cfg.placeName || 'Place', () => this.showDoc('place'));
    this.ui.setTitle(`${cfg.placeName || 'Place'} - Studio`);
    this.ui.layout();
    this.watch();
    this.keys();
    this.view.frameAll();
    window.addEventListener('resize', () => {
      this.ui.layout();
      this.resized();
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    new ResizeObserver(() => this.resized()).observe(this.ui.docs);
    this.refreshUI();
    this.output.print(`Opened ${cfg.placeName || 'place'} (${this.dm.services.get('Workspace').descendants().length} objects in Workspace)`, 'info');
  }

  watch() {
    const self = this;
    this.dm.observe({
      reparented(inst) {
        self.explorer.dirty = true;
        if (self.selection.has(inst) && !inst.parent) {
          self.selection.delete(inst);
          self.selectionChanged();
        }
        self.syncScriptDocs();
      },
      changed(inst, name) {
        if (name === 'Name' || name === 'Parent') self.explorer.dirty = true;
        if (self.selection.has(inst)) self.props.dirty = true;
      },
      created() {
        self.explorer.dirty = true;
      },
    });
  }

  syncScriptDocs() {
    for (const d of this.docs.values()) {
      if (!d.script) continue;
      const gone = !d.script.isDescendantOf(this.dm.root);
      if (gone === !!d.gone) continue;
      d.gone = gone;
      d.ed.ta.readOnly = gone;
      if (gone) this.print(`${d.script.props.get('Name')} is no longer in the place, so its editor is read-only. Undo to bring it back.`, 'err');
    }
  }

  resized() {
    this.r.resize();
  }

  frame(dt) {
    this.view.frame(dt);
    this.ph.world.step();
    this.r.frame(dt);
    if (this.activeDoc === 'place' || !this.activeDoc) this.gui.layout();
    this.explorer.render();
    this.props.render();
    if (this.selRefreshPending) {
      this.selRefreshPending = false;
      this.view.refreshSelection();
    }
    const c = this.r.camera.position;
    this.ui.status(null, `${this.selection.size ? this.selection.size + ' selected  ' : ''}Camera ${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}`);
  }

  hiddenPart(p) {
    return false;
  }

  print(text, kind) {
    this.output.print(text, kind);
  }

  markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.ui.setTitle(`${this.cfg.placeName || 'Place'}* - Studio`);
    }
  }

  record(name, undo, redo) {
    this.undoStack.push({ name, undo, redo });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.markDirty();
    this.refreshUI();
  }

  touch(inst, name) {
    if (!inst.dirtyProps) inst.dirtyProps = new Set();
    inst.dirtyProps.add(name);
  }

  setPropRaw(inst, name, v) {
    this.touch(inst, name);
    this.dm.setProp(inst, name, cloneVal(v));
  }

  setProp(list, name, value) {
    const olds = list.map((i) => [i, cloneVal(i.props.get(name))]);
    for (const i of list) this.setPropRaw(i, name, value);
    this.record(`Change ${name}`, () => olds.forEach(([i, v]) => this.setPropRaw(i, name, v)), () => list.forEach((i) => this.setPropRaw(i, name, value)));
    this.selectionChanged();
  }

  setPositions(list, pos) {
    const start = this.snapshot(list);
    for (const i of list) {
      for (const p of partsOf(i)) {
        const cf = p.props.get('CFrame');
        if (i === p) this.setPropRaw(p, 'CFrame', C.withPos(cf, pos[0], pos[1], pos[2]));
      }
    }
    this.commitTransform(start, list, 'Move');
  }

  snapshot(list) {
    const out = [];
    for (const i of list) for (const p of partsOf(i)) out.push([p, p.props.get('CFrame').slice(), p.props.get('Size').slice()]);
    return out;
  }

  restore(snap) {
    for (const [p, cf, s] of snap) {
      this.dm.setProp(p, 'Size', s);
      this.dm.setProp(p, 'CFrame', cf);
    }
  }

  commitTransform(start, targets, name) {
    const end = this.snapshot(targets);
    if (end.every(([p, cf, s], i) => cf.every((v, k) => Math.abs(v - start[i][1][k]) < 1e-9) && s.every((v, k) => v === start[i][2][k]))) return;
    for (const [p] of end) {
      this.touch(p, 'CFrame');
      this.touch(p, 'Size');
    }
    this.record(name, () => this.restore(start), () => this.restore(end));
    this.selectionChanged();
  }

  commitResize(part, cf0, s0) {
    this.commitTransform([[part, cf0, s0]], [part], 'Resize');
  }

  translate(list, off, commit = true) {
    const start = commit ? this.snapshot(list) : null;
    for (const i of list) for (const p of partsOf(i)) {
      const cf = p.props.get('CFrame');
      this.dm.setProp(p, 'CFrame', C.withPos(cf, cf[0] + off[0], cf[1] + off[1], cf[2] + off[2]));
    }
    if (commit) this.commitTransform(start, list, 'Move');
  }

  rotateAround(list, center, axis, ang) {
    const rot = C.axisAngle(axis[0], axis[1], axis[2], ang);
    const pivot = C.cf(center[0], center[1], center[2]);
    const m = C.mul(C.mul(pivot, rot), C.inv(pivot));
    for (const i of list) for (const p of partsOf(i)) this.dm.setProp(p, 'CFrame', C.orthonormalize(C.mul(m, p.props.get('CFrame'))));
    this.refreshSelectionSoon();
  }

  refreshSelectionSoon() {
    this.selRefreshPending = true;
  }

  select(list) {
    this.selection = new Set(list.filter(Boolean));
    this.lastSelected = list[list.length - 1] || null;
    for (const i of this.selection) this.explorer.expandTo(i);
    this.selectionChanged();
    if (this.lastSelected) requestAnimationFrame(() => this.explorer.scrollTo(this.lastSelected));
  }

  toggleSelect(inst) {
    if (this.selection.has(inst)) this.selection.delete(inst);
    else this.selection.add(inst);
    this.lastSelected = inst;
    this.selectionChanged();
  }

  selectionChanged() {
    this.explorer.dirty = true;
    this.props.dirty = true;
    this.view.refreshSelection();
    this.refreshUI();
  }

  selectionMenu() {
    return SELECTION_MENU;
  }

  refreshUI() {
    this.ui.refresh();
  }

  enabled(id) {
    const sel = this.selection.size > 0;
    const movable = [...this.selection].some((s) => partsOf(s).length);
    if (id.startsWith('na:')) return false;
    if (id.startsWith('material:') || id === 'color' || id === 'anchor') return movable;
    if (id.startsWith('insert:')) return true;
    switch (id) {
      case 'close': case 'gamesettings': return !!endpointUrl('gamePage', this.cfg.placeId);
      case 'undo': return this.undoStack.length > 0;
      case 'redo': return this.redoStack.length > 0;
      case 'cut': case 'copy': case 'delete': case 'duplicate': case 'savemodel': case 'selectchildren': case 'rename': return sel;
      case 'paste': case 'pasteinto': return !!this.clipboard;
      case 'group': return sel;
      case 'ungroup': return [...this.selection].some((s) => s.ClassName === 'Model');
      case 'rotate': case 'tilt': case 'up': case 'down': case 'cam:lookat': return movable;
      case 'pause': case 'reset': case 'exit': return false;
      case 'publish': case 'publish2': return !!endpointUrl('studioSave', this.cfg.placeId);
      case 'run': case 'playsolo': return !!endpointUrl('play', this.cfg.placeId);
      default: return true;
    }
  }

  checked(id) {
    if (id.startsWith('tool:')) return this.tool === id.slice(5);
    if (id.startsWith('grid:')) return this.grid === +id.slice(5);
    if (id.startsWith('view:')) return this.ui.paneOpen(id.slice(5));
    if (id === 'joints') return !!this.manualJoints;
    if (id === 'snap:move') return this.grid > 0;
    if (id === 'snap:rotate') return this.rotateGrid > 0;
    if (id === 'view:commandbar') return !!(this.ui.commandBar && !this.ui.commandBar.hidden);
    if (id === 'anchor') {
      const parts = [...this.selection].flatMap(partsOf);
      return parts.length > 0 && parts.every((p) => p.props.get('Anchored'));
    }
    return false;
  }

  async exec(id) {
    const sel = [...this.selection];
    try {
      if (id.startsWith('tool:')) return this.setTool(id.slice(5));
      if (id.startsWith('grid:')) {
        this.grid = +id.slice(5);
        return this.refreshUI();
      }
      if (id === 'view:commandbar') {
        if (this.ui.commandBar) this.ui.commandBar.hidden = !this.ui.commandBar.hidden;
        this.resized();
        return this.refreshUI();
      }
      if (id.startsWith('view:')) return this.ui.togglePane(id.slice(5));
      if (id.startsWith('material:')) return this.setProp(sel.flatMap(partsOf), 'Material', +id.slice(9));
      if (id.startsWith('insert:part:')) {
        const shape = { Ball: 0, Block: 1, Cylinder: 2 }[id.slice(12)] ?? 1;
        this.insertObject('Part');
        const made = [...this.selection][0];
        if (made && made.ClassName === 'Part' && shape !== 1) {
          this.setPropRaw(made, 'Shape', shape);
          if (shape === 0) this.setPropRaw(made, 'Size', [2, 2, 2]);
          if (shape === 2) this.setPropRaw(made, 'Size', [2, 2, 2]);
        }
        return this.refreshUI();
      }
      if (id.startsWith('insert:cls:')) {
        const cls = id.slice(11);
        const target = [...this.selection][0];
        const into = cls === 'SpawnLocation' || cls === 'WedgePart' ? null : target && target.isA && (target.isA('BasePart') || target.isA('Model') || target.isA('Folder')) && cls !== 'Script' ? target : target && cls === 'Script' ? target : null;
        return this.insertObject(cls, into || undefined);
      }
      if (id.startsWith('rotgrid:')) {
        this.rotateGrid = Math.max(0, +id.slice(8) || 0);
        return this.refreshUI();
      }
      if (id.startsWith('cam:')) return this.camera(id.slice(4));
      switch (id) {
        case 'undo': return this.undo();
        case 'redo': return this.redo();
        case 'delete': return this.remove(sel);
        case 'cut':
          this.copy(sel);
          return this.remove(sel, 'Cut');
        case 'copy': return this.copy(sel);
        case 'paste': return this.paste(null);
        case 'pasteinto': return this.paste(sel[0] || null);
        case 'duplicate':
          this.copy(sel);
          return this.paste(null, true);
        case 'selectall': return this.select(this.dm.services.get('Workspace').children.filter((c) => c.ClassName !== 'Camera' && c.ClassName !== 'Terrain'));
        case 'selectchildren': return this.select(sel.flatMap((s) => s.children));
        case 'group': return this.group(sel);
        case 'ungroup': return this.ungroup(sel);
        case 'rotate': return this.turn(sel, [0, 1, 0], 'Rotate');
        case 'tilt': return this.turn(sel, [1, 0, 0], 'Tilt');
        case 'up': return this.translate(sel, [0, this.grid >= 1 ? 1.2 : this.grid || 0.2, 0]);
        case 'down': return this.translate(sel, [0, -(this.grid >= 1 ? 1.2 : this.grid || 0.2), 0]);
        case 'lock': return this.setProp(sel.flatMap(partsOf), 'Locked', true);
        case 'lockall': return this.setProp(this.dm.services.get('Workspace').descendants().filter((d) => d.isA('BasePart') && d.props.get('Locked')), 'Locked', false);
        case 'rename': {
          const n = await this.ui.prompt('Rename', 'Name', sel[0].props.get('Name'));
          if (n != null && n !== '') this.setProp(sel, 'Name', n);
          return;
        }
        case 'objectbrowser': return this.openObjectBrowser();
        case 'insert:object': return this.insertObjectDialog();
        case 'insert:service': return this.insertService();
        case 'insert:model': return this.insertModel();
        case 'clearstarterpack': {
          const sp = this.dm.services.get('StarterPack');
          return sp && this.remove([...sp.children], 'Clear StarterPack');
        }
        case 'publish': case 'publish2': return this.save();
        case 'saveas': return this.download(writePlace(this.dm), (this.cfg.placeName || 'place') + '.rbxl');
        case 'savemodel': return this.saveModel(sel);
        case 'open': return this.openFile();
        case 'run': case 'playsolo': return this.playSolo();
        case 'joints':
          this.manualJoints = !this.manualJoints;
          return this.refreshUI();
        case 'fullscreen':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.().catch(() => {});
          return;
        case 'snap:move':
          if (this.grid > 0) {
            this.lastGrid = this.grid;
            this.grid = 0;
          } else this.grid = this.lastGrid || 1;
          return this.refreshUI();
        case 'snap:rotate':
          if (this.rotateGrid > 0) {
            this.lastRotateGrid = this.rotateGrid;
            this.rotateGrid = 0;
          } else this.rotateGrid = this.lastRotateGrid || 15;
          return this.refreshUI();
        case 'anchor': {
          const parts = sel.flatMap(partsOf);
          return this.setProp(parts, 'Anchored', !parts.every((p) => p.props.get('Anchored')));
        }
        case 'color': {
          const parts = sel.flatMap(partsOf);
          const n = await this.pickBrickColor(parts[0] ? parts[0].props.get('BrickColor') : this.paintColor);
          if (n == null) return;
          this.paintColor = n;
          return this.setProp(parts, 'BrickColor', n);
        }
        case 'gamesettings': return window.open(endpointUrl('gamePage', this.cfg.placeId), '_blank');
        case 'close': {
          if (this.dirty && !(await this.ui.confirm('Close Place', 'Close the place without saving your changes?'))) return;
          this.dirty = false;
          location.href = endpointUrl('gamePage', this.cfg.placeId);
          return;
        }
        case 'screenshot': {
          this.r.frame(0);
          const a = document.createElement('a');
          a.download = `${this.cfg.placeName || 'Screenshot'}.png`.replace(/[\\/:*?"<>|]/g, '_');
          a.href = this.r.canvas.toDataURL('image/png');
          a.click();
          return;
        }
        case 'about': if (this.era === 2018) return this.ui.alert('About Roblox Studio', 'Chocolate Studio, 2018 edition\nEdits places in the browser, alone or with Team Create. This place plays in the 2018 client.');
          return this.ui.alert('About Studio', 'Chocolate Studio 26.11.3-hotfix\nEdits places in the browser, alone or with Team Create, and saves them in the 2012 place format.');
        default: return;
      }
    } catch (err) {
      console.error(err);
      this.print(String(err && err.message ? err.message : err), 'err');
    }
  }

  async setTool(t) {
    if (t === this.tool) {
      this.tool = 'none';
      this.view.refreshSelection();
      this.refreshUI();
      this.ui.status('Camera only');
      return;
    }
    if (!TOOLS.includes(t)) return;
    if (t === 'paint') {
      const n = await brickPicker(this.ui, this.paintColor);
      if (n == null) return;
      this.paintColor = n;
    }
    if (t === 'material') {
      const m = await this.ui.dialog('Change Material', (body) => {
        const s = el('select', null, body);
        for (const [k, v] of Object.entries(ENUMS.Material || {})) {
          const o = el('option', null, s, k);
          o.value = v;
        }
        s.value = String(this.paintMaterial);
        return () => +s.value;
      }, [['OK', true], ['Cancel', null]]);
      if (m == null) return;
      this.paintMaterial = m;
    }
    this.tool = t;
    this.view.refreshSelection();
    this.refreshUI();
    this.ui.status(`Tool: ${t}`);
  }

  toolDown(e, view) {
    const t = this.tool;
    if (t !== 'drag' && t !== 'axis' && t !== 'move' && t !== 'resize' && t !== 'size' && t !== 'rotate') return null;
    const hit = view.pick(e);
    if (!hit.part) return null;
    const target = view.selectable(hit.part, e.altKey);
    if (!this.selection.has(target)) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) this.toggleSelect(target);
      else this.select([target]);
    }
    if (t === 'drag' && !(e.ctrlKey || e.metaKey) && partsOf(target).every((p) => !p.props.get('Locked'))) return view.dragTool(e, hit);
    return { kind: 'tap-done' };
  }

  toolTap(e, view) {
    const t = this.tool;
    const hit = view.pick(e, { locked: t === 'lock' });
    if (['drag', 'axis', 'move', 'resize', 'size', 'rotate'].includes(t)) {
      if (!hit.part) this.select([]);
      return;
    }
    if (!hit.part) return;
    const p = hit.part;
    if (t === 'lock') return this.setProp([p], 'Locked', !p.props.get('Locked'));
    if (t === 'anchor') return this.setProp([p], 'Anchored', !p.props.get('Anchored'));
    if (t === 'paint') return this.setProp([p], 'BrickColor', this.paintColor);
    if (t === 'dropper') {
      this.paintColor = p.props.get('BrickColor');
      this.tool = 'paint';
      this.refreshUI();
      return;
    }
    if (t === 'material') return this.setProp([p], 'Material', this.paintMaterial);
    if (t.startsWith('surface')) return this.setProp([p], view.faceOf(p, hit.normal), +t.slice(7));
  }

  camera(c) {
    const v = this.view;
    switch (c) {
      case 'panleft': v.yaw += Math.PI / 8; break;
      case 'panright': v.yaw -= Math.PI / 8; break;
      case 'tiltup': v.pitch = Math.min(1.5, v.pitch + 0.15); break;
      case 'tiltdown': v.pitch = Math.max(-1.5, v.pitch - 0.15); break;
      case 'zoomin': v.zoom(0.8); break;
      case 'zoomout': v.zoom(1.25); break;
      case 'lookat': v.lookAt([...this.selection].flatMap(partsOf)); break;
      case 'extents': v.frameAll(); break;
    }
  }

  undo() {
    const a = this.undoStack.pop();
    if (!a) return;
    a.undo();
    this.redoStack.push(a);
    this.markDirty();
    this.print(`Undo ${a.name}`);
    this.selectionChanged();
  }

  redo() {
    const a = this.redoStack.pop();
    if (!a) return;
    a.redo();
    this.undoStack.push(a);
    this.markDirty();
    this.selectionChanged();
  }

  reparentRaw(inst, parent) {
    inst.parentLocked = false;
    this.dm.setParent(inst, parent);
  }

  remove(list, name = 'Delete') {
    list = list.filter((i) => i.parent && !isService(i.ClassName) && !list.some((o) => o !== i && i.isDescendantOf(o)));
    if (!list.length) return;
    const was = list.map((i) => [i, i.parent]);
    for (const i of list) this.reparentRaw(i, null);
    this.record(name, () => was.forEach(([i, p]) => this.reparentRaw(i, p)), () => list.forEach((i) => this.reparentRaw(i, null)));
    this.select([]);
  }

  reparent(list, target) {
    list = list.filter((i) => i !== target && !target.isDescendantOf(i) && !isService(i.ClassName) && i.parent !== target);
    if (!list.length) return;
    const was = list.map((i) => [i, i.parent]);
    for (const i of list) this.reparentRaw(i, target);
    this.record('Move', () => was.forEach(([i, p]) => this.reparentRaw(i, p)), () => list.forEach((i) => this.reparentRaw(i, target)));
    this.select(list);
  }

  add(list, name) {
    const at = list.map((i) => [i, i.parent]);
    this.record(name, () => at.forEach(([i]) => this.reparentRaw(i, null)), () => at.forEach(([i, p]) => this.reparentRaw(i, p)));
    this.select(list);
  }

  freshClone(inst) {
    const c = this.dm.clone(inst);
    if (!c) return null;
    this.adopt([c]);
    return c;
  }

  copy(list) {
    list = list.filter((i) => !isService(i.ClassName) && !list.some((o) => o !== i && i.isDescendantOf(o)));
    if (!list.length) return;
    this.clipboard = list.map((i) => this.freshClone(i)).filter(Boolean);
    this.refreshUI();
  }

  paste(into, inPlace = false) {
    if (!this.clipboard) return;
    const ws = this.dm.services.get('Workspace');
    const parent = into || ws;
    const made = this.clipboard.map((i) => this.freshClone(i)).filter(Boolean);
    for (const m of made) this.dm.setParent(m, parent);
    if (!into && !inPlace) {
      const parts = made.flatMap(partsOf);
      if (parts.length) {
        const b = boundsOf(parts);
        this.translate(made, [0, this.dropHeight(b) - b.min[1], 0], false);
      }
    } else if (inPlace) {
      const parts = made.flatMap(partsOf);
      if (parts.length) this.translate(made, [0, boundsOf(parts).size[1], 0], false);
    }
    this.add(made, 'Paste');
  }

  dropHeight(b) {
    let top = b.min[1];
    const ws = this.dm.services.get('Workspace');
    for (const d of ws.descendants()) {
      if (!d.isA('BasePart') || this.selection.has(d)) continue;
      const pb = boundsOf([d]);
      if (pb.max[0] > b.min[0] && pb.min[0] < b.max[0] && pb.max[2] > b.min[2] && pb.min[2] < b.max[2]) top = Math.max(top, pb.max[1]);
    }
    return top;
  }

  turn(list, axis, name) {
    const parts = list.flatMap(partsOf);
    if (!parts.length) return;
    const start = this.snapshot(list);
    this.rotateAround(list, boundsOf(parts).center, axis, Math.PI / 2);
    this.commitTransform(start, list, name);
  }

  group(list) {
    list = list.filter((i) => !isService(i.ClassName) && !list.some((o) => o !== i && i.isDescendantOf(o)));
    if (!list.length) return;
    const parent = list[0].parent;
    const model = this.dm.create('Model', null);
    model.props.set('Name', 'Model');
    const was = list.map((i) => [i, i.parent]);
    this.dm.setParent(model, parent);
    for (const i of list) this.reparentRaw(i, model);
    this.record('Group', () => {
      was.forEach(([i, p]) => this.reparentRaw(i, p));
      this.reparentRaw(model, null);
    }, () => {
      this.reparentRaw(model, parent);
      list.forEach((i) => this.reparentRaw(i, model));
    });
    this.select([model]);
  }

  ungroup(list) {
    const models = list.filter((m) => m.ClassName === 'Model');
    if (!models.length) return;
    const moves = [];
    for (const m of models) {
      for (const c of [...m.children]) moves.push([c, m, m.parent]);
    }
    const homes = models.map((m) => [m, m.parent]);
    for (const [c, , p] of moves) this.reparentRaw(c, p);
    for (const [m] of homes) this.reparentRaw(m, null);
    this.record('Ungroup', () => {
      homes.forEach(([m, p]) => this.reparentRaw(m, p));
      moves.forEach(([c, m]) => this.reparentRaw(c, m));
    }, () => {
      moves.forEach(([c, , p]) => this.reparentRaw(c, p));
      homes.forEach(([m]) => this.reparentRaw(m, null));
    });
    this.select(moves.map(([c]) => c));
  }

  defaults(inst) {
    if (inst.isA('BasePart') && this.era === 2018) {
      for (const [k, v] of [['TopSurface', 0], ['BottomSurface', 0], ['Anchored', false], ['BrickColor', 194], ['FormFactor', 3]]) if (inst.info.all.has(k)) this.setPropRaw(inst, k, v);
      if (inst.ClassName === 'Part' || inst.ClassName === 'WedgePart') this.setPropRaw(inst, 'Size', [4, 1, 2]);
      if (inst.ClassName === 'SpawnLocation') {
        this.setPropRaw(inst, 'Size', [12, 1, 12]);
        this.setPropRaw(inst, 'Anchored', true);
      }
      return;
    }
    if (inst.isA('BasePart')) {
      for (const [k, v] of [['TopSurface', 3], ['BottomSurface', 4], ['Anchored', false], ['BrickColor', 194]]) if (inst.info.all.has(k)) this.setPropRaw(inst, k, v);
      if (inst.ClassName === 'SpawnLocation' || inst.ClassName === 'Seat') this.setPropRaw(inst, 'Size', [6, 1.2, 6]);
      if (inst.ClassName === 'TrussPart') this.setPropRaw(inst, 'Size', [2, 10, 2]);
      if (inst.ClassName === 'SpawnLocation') this.setPropRaw(inst, 'Anchored', true);
      this.setPropRaw(inst, 'FormFactor', inst.props.get('FormFactor'));
    }
  }

  insertObject(cls, into) {
    if (!isCreatable(cls)) return;
    const ws = this.dm.services.get('Workspace');
    const sel = [...this.selection][0];
    const inst = this.dm.create(cls, null);
    inst.props.set('Name', cls);
    this.touch(inst, 'Name');
    this.defaults(inst);
    let parent = into || (inst.isA('BasePart') || cls === 'Model' ? ws : sel && !isService(sel.ClassName) ? sel : sel || ws);
    if (inst.isA('BasePart')) {
      const c = this.view.cam;
      const dir = c.getWorldDirection(new (c.position.constructor)());
      const hit = this.ph.raycast([c.position.x, c.position.y, c.position.z], [dir.x * 500, dir.y * 500, dir.z * 500], []);
      const p = hit.part ? hit.point : [this.view.focus.x, this.view.focus.y, this.view.focus.z];
      const s = inst.props.get('Size');
      const g = this.grid || 0;
      const snapv = (v) => (g ? Math.round(v / g) * g : v);
      this.setPropRaw(inst, 'CFrame', C.cf(snapv(p[0]), p[1] + s[1] / 2, snapv(p[2])));
      const b = boundsOf([inst]);
      this.setPropRaw(inst, 'CFrame', C.cf(snapv(p[0]), this.dropHeight(b) + s[1] / 2, snapv(p[2])));
    }
    this.dm.setParent(inst, parent);
    this.add([inst], `Insert ${cls}`);
    if (cls === 'Script' || cls === 'LocalScript') this.openScript(inst);
  }

  async insertObjectDialog() {
    const cls = await this.ui.dialog('Insert Object', (body) => {
      const s = el('select', null, body);
      s.size = 14;
      s.style.width = '100%';
      for (const c of creatableClasses(this.era)) el('option', null, s, c).value = c;
      s.value = 'Part';
      s.addEventListener('dblclick', () => body.closest('.st-dialog').querySelector('button').click());
      return () => s.value;
    }, [['OK', true], ['Cancel', null]]);
    if (cls) this.insertObject(cls);
  }

  async insertService() {
    const missing = ['Teams', 'SoundService', 'Debris', 'StarterGui', 'StarterPack', 'Lighting'].filter((s) => !this.dm.services.get(s) || this.dm.services.get(s).studioHidden);
    const name = await this.ui.dialog('Insert Service', (body) => {
      if (!missing.length) {
        el('div', null, body, 'All services are already in the place.');
        return () => null;
      }
      const s = el('select', null, body);
      for (const m of missing) el('option', null, s, m).value = m;
      return () => s.value;
    }, [['OK', true], ['Cancel', null]]);
    if (!name) return;
    const svc = this.dm.service(name);
    svc.studioHidden = false;
    this.explorer.dirty = true;
    this.markDirty();
  }

  async insertModel() {
    const id = await this.ui.prompt('Insert Model', 'Asset ID of the model');
    const n = parseInt(id, 10);
    if (!(n > 0)) return;
    return this.insertAsset(n);
  }

  async insertAsset(n, label) {
    this.print(`Loading ${label || 'model ' + n}...`);
    const bytes = await assetBytes(n);
    const head = new TextDecoder().decode(bytes.subarray(0, 8));
    if (!head.startsWith('<roblox')) throw new Error(`${label || 'Asset ' + n} is not a model`);
    const nodes = parsePlace(bytes);
    const ws = this.dm.services.get('Workspace');
    const made = this.dm.load(nodes, ws, { track: true });
    const tops = made.filter((m) => m.parent === ws);
    this.adopt(tops);
    const parts = tops.flatMap(partsOf);
    if (parts.length) {
      const b = boundsOf(parts);
      const f = this.view.focus;
      this.translate(tops, [f.x - b.center[0], this.dropHeight(b) - b.min[1], f.z - b.center[2]], false);
    }
    this.add(tops, 'Insert Model');
    this.print(`Inserted ${label || 'model ' + n}`, 'info');
  }

  activate(inst) {
    if (inst.ClassName === 'Script' || inst.ClassName === 'LocalScript' || inst.ClassName === 'ModuleScript') this.openScript(inst);
    else if (partsOf(inst).length) this.view.lookAt(partsOf(inst));
  }

  openScript(script) {
    const id = 'script:' + script.id;
    let doc = this.docs.get(id);
    if (!doc) {
      const ed = new ScriptEditor(this.ui.docs, script, (src, save) => {
        if (src !== script.props.get('Source')) {
          const old = script.props.get('Source');
          const set = (v) => {
            this.setPropRaw(script, 'Source', v);
            const d = this.docs.get(id);
            if (d) d.ed.reload();
          };
          this.setPropRaw(script, 'Source', src);
          this.record('Edit Script', () => set(old), () => set(src));
        }
        if (save) this.save();
      });
      doc = { ed, script };
      this.docs.set(id, doc);
      this.ui.tab(id, script.props.get('Name'), () => this.showDoc(id), () => this.closeDoc(id));
    }
    this.showDoc(id);
  }

  openObjectBrowser() {
    const id = 'browser';
    if (!this.docs.has(id)) {
      this.docs.set(id, { ed: new ObjectBrowser(this.ui.docs, this) });
      this.ui.tab(id, 'Object Browser', () => this.showDoc(id), () => this.closeDoc(id));
    }
    this.showDoc(id);
  }

  showDoc(id) {
    this.activeDoc = id;
    this.viewEl.style.visibility = id === 'place' ? 'visible' : 'hidden';
    for (const [k, d] of this.docs) d.ed.show(k === id);
    this.ui.tab(id, '', () => {}, null);
    if (this.ui.setScriptMode) this.ui.setScriptMode(id.startsWith('script:'));
    if (id !== 'place') this.docs.get(id).ed.reload();
  }

  closeDoc(id) {
    const d = this.docs.get(id);
    if (!d) return;
    d.ed.dispose();
    this.docs.delete(id);
    this.ui.removeTab(id);
    if (this.activeDoc === id) this.showDoc('place');
  }

  async pickBrickColor(current) {
    return brickPicker(this.ui, current);
  }

  keys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const map = ctrl ? { z: 'undo', y: 'redo', x: 'cut', c: 'copy', v: e.shiftKey ? 'pasteinto' : 'paste', d: 'duplicate', a: 'selectall', g: 'group', u: 'ungroup', r: 'rotate', t: 'tilt', s: 'publish' } : { delete: 'delete', f: 'cam:lookat' };
      const cmd = map[k] || (!ctrl && k === 'backspace' && this.selection.size ? 'delete' : null);
      if (cmd && this.enabled(cmd)) {
        e.preventDefault();
        this.exec(cmd);
      }
    });
  }

  download(text, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/xml' }));
    a.download = name.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  saveModel(list) {
    list = list.filter((i) => !isService(i.ClassName) && !list.some((o) => o !== i && i.isDescendantOf(o)));
    if (!list.length) return;
    this.download(writeModel(this.dm, list), (list[0].props.get('Name') || 'Model') + '.rbxm');
  }

  adopt(made) {
    const walk = (x) => {
      x.dirtyProps = new Set(x.fileProps ? x.fileProps.keys() : []);
      x.fileProps = null;
      x.fileRef = null;
      for (const k of x.children) walk(k);
    };
    made.forEach(walk);
  }

  openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rbxl,.rbxlx,.rbxm,.rbxmx';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const nodes = parsePlace(bytes);
      const isPlace = nodes.some((n) => n.cls === 'Workspace');
      if (isPlace) {
        const ok = await this.ui.confirm('Open', `Replace everything in this place with ${f.name}? You can still leave without saving.`);
        if (!ok) return;
        for (const c of [...this.dm.root.children]) {
          if (isService(c.ClassName)) for (const k of [...c.children]) if (k.ClassName !== 'Camera') this.reparentRaw(k, null);
          else this.reparentRaw(c, null);
        }
        this.dm.load(nodes, this.dm.root, { track: true });
        this.undoStack = [];
        this.redoStack = [];
        this.markDirty();
        this.select([]);
        this.view.frameAll();
        this.print(`Opened ${f.name}`, 'info');
      } else {
        const ws = this.dm.services.get('Workspace');
        const made = this.dm.load(nodes, ws, { track: true }).filter((m) => m.parent === ws);
        this.adopt(made);
        this.add(made, 'Insert File');
      }
    });
    input.click();
  }

  async save() {
    const url = endpointUrl('studioSave', this.cfg.placeId);
    if (!url) return;
    for (const d of this.docs.values()) d.ed.ta.blur();
    this.ui.status('Saving...');
    this.print('Saving place...');
    const xml = writePlace(this.dm);
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/xml', 'X-CSRF-Token': this.cfg.csrf || '' },
      body: xml,
    }).catch((e) => ({ ok: false, statusText: e.message, json: async () => ({}) }));
    const res = await r.json().catch(() => ({}));
    if (r.ok && res.success !== false) {
      this.dirty = false;
      this.ui.setTitle(`${this.cfg.placeName || 'Place'} - Studio`);
      this.ui.status('Saved');
      this.print(`Saved (${Math.round(xml.length / 1024)} KB)`, 'info');
      return true;
    }
    const msg = res.error || r.statusText || 'Save failed';
    this.ui.status('Save failed');
    this.print('Save failed: ' + msg, 'err');
    this.ui.alert('Save failed', msg);
    return false;
  }

  async playSolo() {
    if (this.dirty) {
      const ok = await this.ui.confirm('Play Solo', 'Save the place and open it in a new tab to test it?');
      if (!ok) return;
      if (!(await this.save())) return;
    }
    window.open(endpointUrl('play', this.cfg.placeId), '_blank');
  }
}

export { SERVICES };
