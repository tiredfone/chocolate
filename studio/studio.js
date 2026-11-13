import * as C from '../shared/cframe.js';
import { isCreatable, isService, ENUMS } from '../shared/classes.js';
import { parsePlace } from '../shared/rbxl.js';
import { writePlace, writeModel } from '../shared/rbxlx.js';
import { endpointUrl, assetBytes } from '../client/assets.js';
import { UI, SELECTION_MENU, el, setClassIconSheet } from './ui.js';
import { UI2018 } from './ui2018.js';
import { Explorer, Properties, Output, Toolbox, ScriptEditor, brickPicker, creatableClasses, classIcon, setIconEra } from './panes.js';
import { StudioView, partsOf, boundsOf } from './view.js';
import { ObjectBrowser } from './browser.js';
import { Extras } from './extras.js';
import { solid, shapeOf } from './csgops.js';
import { StudioLua, analysisPane } from './lua.js';
import { Debugger } from './debug.js';
import { TerrainTools } from './terrain.js';
import { Gui } from '../client/gui.js';

const TOOLS = ['drag', 'axis', 'resize', 'lock', 'anchor', 'paint', 'dropper', 'material', 'move', 'rotate', 'size', 'surface0', 'surface1', 'surface2', 'surface3', 'surface4', 'surface5', 'surface6', 'surface7', 'surface10'];
const INSERT_COMMON = ['Part', 'Script', 'LocalScript', 'Model', 'Decal', 'Sound', 'ClickDetector', 'Configuration', 'StringValue', 'IntValue', 'NumberValue', 'BoolValue', 'ObjectValue'];
const INSERT_COMMON_2018 = ['Part', 'Script', 'LocalScript', 'ModuleScript', 'Model', 'Folder', 'RemoteEvent', 'RemoteFunction', 'Decal', 'Sound', 'PointLight', 'ClickDetector', 'Attachment', 'StringValue', 'IntValue', 'BoolValue'];
const INSERTABLE_SERVICES_2018 = ['Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService', 'Chat', 'LocalizationService', 'TestService', 'Debris',
  'InsertService', 'CollectionService', 'PhysicsService', 'TweenService', 'HttpService', 'RunService', 'MarketplaceService', 'BadgeService', 'DataStoreService', 'TeleportService', 'UserInputService',
  'ContextActionService', 'GamePassService', 'PointsService', 'PathfindingService', 'TextService', 'GroupService', 'VRService', 'HapticService', 'Selection', 'ChangeHistoryService', 'TimerService', 'CookiesService', 'LogService', 'AssetService', 'FriendService', 'NotificationService'];
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

class PlayDoc {
  constructor(parent, url) {
    this.el = el('div', 'st-playdoc', parent);
    this.frame = el('iframe', null, this.el);
    this.frame.allow = 'fullscreen; autoplay; pointer-lock; gamepad';
    this.frame.src = url;
    this.ta = { readOnly: false, blur() {} };
  }

  show(on) {
    this.el.hidden = !on;
    if (on) setTimeout(() => this.frame.focus(), 0);
  }

  reload() {}

  dispose() {
    this.frame.src = 'about:blank';
    this.el.remove();
  }
}

function socketUrl(path) {
  if (/^wss?:\/\//.test(path)) return path;
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`;
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
    setIconEra(this.era);
    if (this.era === 2018) setClassIconSheet('/studio/ui2018/images/ClassImages.PNG');
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
    this.extras = new Extras(this);
    this.terrainTools = new TerrainTools(this);
    this.lua = new StudioLua(this);
    this.debugger = new Debugger(this);
    this.pluginIcons = new Map();
    if (this.lua.installed().length) setTimeout(() => this.lua.loadPlugins().catch((e) => this.print('Plugins could not start: ' + e.message, 'err')), 500);
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
    this.extras.frame(dt);
    if (this.lua.host) this.lua.tick(dt);
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
    if (this.extras && this.extras.blocked(targets)) {
      this.restore(start);
      this.ui.status('Collisions is on: parts cannot be moved into other parts');
      this.selectionChanged();
      return;
    }
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
    if (this.lua && this.lua.host) {
      const svc = this.dm.services.get('Selection');
      if (svc) this.dm.emit(svc, 'SelectionChanged');
    }
    this.explorer.dirty = true;
    this.props.dirty = true;
    this.view.refreshSelection();
    this.refreshUI();
  }

  selectionMenu(target) {
    const common = (this.era === 2018 ? INSERT_COMMON_2018 : INSERT_COMMON).filter((c) => isCreatable(c));
    const insert = [...common.map((c) => ['insertin:' + c, c]), null, ['insertin:?', 'Advanced Objects...']];
    if (!this.selection.size && !target) {
      return [['paste', 'Paste\tCtrl+V'], null, ['Insert Object', insert], ['insert:model', 'Insert Model...'], ['open', 'Insert from File...'], null, ['selectall', 'Select All\tCtrl+A'], ['cam:extents', 'Zoom Extents']];
    }
    return [
      ['cut', 'Cut\tCtrl+X'], ['copy', 'Copy\tCtrl+C'], ['pasteinto', 'Paste Into\tCtrl+Shift+V'], ['duplicate', 'Duplicate\tCtrl+D'], ['delete', 'Delete\tDel'], ['rename', 'Rename\tF2'], null,
      ['group', 'Group\tCtrl+G'], ['ungroup', 'Ungroup\tCtrl+U'], ['selectchildren', 'Select Children'], ['cam:lookat', 'Zoom to\tF'], null,
      ['Insert Object', insert], ['insertfile', 'Insert from File...'], null,
      ['anchor', 'Anchor'], ['lock', 'Lock'], null,
      ['savemodel', 'Save to File...'],
    ];
  }

  insertMenu(parent, rect) {
    this.ui.classPicker(rect, creatableClasses(this.era), (cls) => {
      if (parent && !this.selection.has(parent)) this.select([parent]);
      this.insertObject(cls, parent || undefined);
    });
  }

  refreshUI() {
    this.ui.refresh();
  }

  enabled(id) {
    if (this.extras && this.extras.handles(id)) return this.extras.enabled(id);
    const sel = this.selection.size > 0;
    const movable = [...this.selection].some((s) => partsOf(s).length);
    if (id.startsWith('na:')) return false;
    if (id.startsWith('material:') || id === 'color' || id === 'anchor') return movable;
    if (id.startsWith('insert:')) return true;
    switch (id) {
      case 'close': return !!endpointUrl('gamePage', this.cfg.placeId);
      case 'gamesettings': return !!(endpointUrl('studioSettings', this.cfg.placeId) || endpointUrl('gamePage', this.cfg.placeId));
      case 'undo': return this.undoStack.length > 0;
      case 'redo': return this.redoStack.length > 0;
      case 'cut': case 'copy': case 'delete': case 'duplicate': case 'savemodel': case 'selectchildren': case 'rename': return sel;
      case 'paste': case 'pasteinto': return !!this.clipboard;
      case 'group': return sel;
      case 'ungroup': return [...this.selection].some((s) => s.ClassName === 'Model');
      case 'union': case 'negate': return movable;
      case 'separate': return [...this.selection].some((s) => s.isA && s.isA('PartOperation'));
      case 'rotate': case 'tilt': case 'up': case 'down': case 'cam:lookat': return movable;
      case 'pause': case 'reset': case 'exit': return false;
      case 'publish': case 'publish2': return !!endpointUrl('studioSave', this.cfg.placeId);
      case 'run': return !!endpointUrl('play', this.cfg.placeId);
      case 'playsolo': return !!endpointUrl('play', this.cfg.placeId) && !this.playStarting;
      case 'stop': return !!this.playing;
      case 'runscript': case 'analysis': case 'plugins': return true;
      case 'dbg:into': case 'dbg:over': case 'dbg:out': case 'dbg:continue': return !!(this.debugger && this.debugger.paused);
      case 'dbg:pause': return !!this.playing && !(this.debugger && this.debugger.paused);
      case 'gotoerror': return !!(this.debugger && this.debugger.lastError);
      case 'expandfolds': case 'collapsefolds': {
        const d = this.docs.get(this.activeDoc);
        return !!(d && d.script);
      }
      case 'teamtest': return !!(this.team && this.team.open && endpointUrl('play', this.cfg.placeId));
      case 'teamtest:stop': return !!(this.team && this.team.open && this.team.test);
      default: return true;
    }
  }

  checked(id) {
    if (this.extras && this.extras.handles(id)) return this.extras.checked(id);
    if (this.terrainTools && this.terrainTools.handles(id)) return this.terrainTools.checked(id);
    if (id.startsWith('tool:')) return this.tool === id.slice(5);
    if (id.startsWith('grid:')) return this.grid === +id.slice(5);
    if (id.startsWith('view:')) return this.ui.paneOpen(id.slice(5));
    if (id === 'joints') return !!this.manualJoints;
    if (id === 'snap:move') return this.grid > 0;
    if (id === 'snap:rotate') return this.rotateGrid > 0;
    if (id === 'view:commandbar') return !!(this.ui.commandBar && !this.ui.commandBar.hidden);
    if (id.startsWith('break:')) return this.debugger && this.debugger.mode === id.slice(6);
    if (id === 'anchor') {
      const parts = [...this.selection].flatMap(partsOf);
      return parts.length > 0 && parts.every((p) => p.props.get('Anchored'));
    }
    return false;
  }

  async exec(id) {
    const sel = [...this.selection];
    try {
      if (this.extras.handles(id)) return await this.extras.exec(id);
      if (this.terrainTools.handles(id)) return await this.terrainTools.exec(id);
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
      if (id.startsWith('insertin:')) {
        const cls = id.slice(9);
        const into = sel[0] || undefined;
        if (cls === '?') return this.insertMenu(into || null, { left: window.innerWidth / 2 - 120, right: window.innerWidth / 2 - 120, top: 120, bottom: 120 });
        return this.insertObject(cls, into);
      }
      switch (id) {
        case 'insertfile': return this.openFile(sel[0] || null);
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
        case 'gamesettings': return this.gameSettings();
        case 'teamtest': {
          if (this.team.test) return this.joinTeamTest();
          this.team.wantTest = true;
          this.print('Starting Team Test with the place as everyone is editing it now...', 'info');
          return this.team.send({ t: 'teamtest', on: true });
        }
        case 'teamtest:stop': return this.team.send({ t: 'teamtest', on: false });
        case 'runscript': return this.runScriptFile();
        case 'analysis': {
          this.print('Checking scripts...');
          await this.lua.ensure();
          return analysisPane(this, this.lua);
        }
        case 'plugins': return this.managePlugins();
        case 'dbg:into': return this.debugger.command('into');
        case 'dbg:over': return this.debugger.command('over');
        case 'dbg:out': return this.debugger.command('out');
        case 'dbg:continue': return this.debugger.command('continue');
        case 'dbg:pause': return this.debugger.command('pause');
        case 'addwatch': return this.debugger.addWatch();
        case 'break:never': case 'break:all': case 'break:unhandled':
          this.debugger.mode = id.slice(6);
          return this.refreshUI();
        case 'gotoerror': return this.debugger.gotoError();
        case 'view:breakpoints':
          this.debugger.renderBreakpoints();
          return this.ui.togglePane('breakpoints');
        case 'view:callstack':
          this.debugger.renderStack();
          return this.ui.togglePane('callstack');
        case 'view:watch':
          this.debugger.renderWatch();
          return this.ui.togglePane('watch');
        case 'expandfolds': case 'collapsefolds': {
          const d = this.docs.get(this.activeDoc);
          if (d && d.ed && d.ed.fold) id === 'collapsefolds' ? d.ed.fold() : d.ed.unfold();
          return;
        }
        case 'union': return this.csgUnion(sel);
        case 'negate': return this.csgNegate(sel);
        case 'separate': return this.csgSeparate(sel);
        case 'stop': return this.endPlaySolo(true);
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
          return this.ui.alert('About Studio', 'Chocolate Studio 26.12-preview\nEdits places in the browser, alone or with Team Create, and saves them in the 2012 place format.');
        default: return;
      }
    } catch (err) {
      console.error(err);
      this.print(String(err && err.message ? err.message : err), 'err');
    }
  }

  async setTool(t) {
    if (this.terrainTools && this.terrainTools.tool) this.terrainTools.setTool(null);
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

  async startPlaySolo() {
    if (this.playing && this.debugger.paused) return this.debugger.command('continue');
    if (this.playing) return this.showDoc('play');
    if (this.playStarting) return;
    this.playStarting = true;
    this.refreshUI();
    this.print('Starting Play Solo with the place as it is now...', 'info');
    try {
      const xml = await this.debugger.prepare().catch((e) => {
        this.print('Scripts could not be prepared for debugging: ' + e.message, 'warn');
        return writePlace(this.dm);
      });
      const bps = this.debugger.payload(), watches = this.debugger.watches;
      if (this.team && this.team.open) {
        this.team.send({ t: 'playsolo', on: true, xml, bps, watches });
        return;
      }
      const ws = await this.soloSocket();
      ws.send(JSON.stringify({ t: 'playsolo', on: true, xml, bps, watches }));
    } catch (e) {
      this.playStarting = false;
      this.refreshUI();
      throw e;
    }
  }

  soloSocket() {
    if (this.solo && this.solo.readyState === 1) return Promise.resolve(this.solo);
    return (async () => {
      const r = await fetch(endpointUrl('studioTestTicket', this.cfg.placeId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.cfg.csrf || '' },
        body: '{}',
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ticket) throw new Error((j && j.error) || 'Play Solo is not available');
      const base = socketUrl(j.ws || this.cfg.ticketWs || '/chocolate/ws');
      const ws = new WebSocket(`${base}${base.includes('?') ? '&' : '?'}ticket=${j.ticket}`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The game server did not answer')), 20000);
        ws.onmessage = (ev) => {
          let m;
          try {
            m = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (m.t === 'solo') {
            clearTimeout(timer);
            resolve();
          } else if (m.t === 'playsolo') this.onPlaySolo(m);
          else if (m.t === 'dbg') this.debugger.onServer(m);
          else if (m.t === 'kick') {
            clearTimeout(timer);
            reject(new Error(m.m || 'The game server refused Play Solo'));
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Could not reach the game server'));
        };
      });
      ws.onclose = () => {
        if (this.solo === ws) this.solo = null;
        if (this.playing) this.endPlaySolo(false);
        this.playStarting = false;
        this.refreshUI();
      };
      this.solo = ws;
      return ws;
    })();
  }

  onPlaySolo(m) {
    this.playStarting = false;
    if (m.on && m.job) {
      const url = endpointUrl('play', this.cfg.placeId);
      this.playing = m.job;
      const id = 'play';
      if (this.docs.has(id)) this.closeDoc(id, true);
      const ed = new PlayDoc(this.ui.docs, this.extras.playUrl(`${url}${url.includes('?') ? '&' : '?'}server=${encodeURIComponent('job:' + m.job)}`));
      const cls = this.extras.playClass();
      if (cls) ed.el.classList.add(cls);
      ed.frame.addEventListener('load', () => this.extras.sendMute());
      this.docs.set(id, { ed, play: true });
      this.ui.tab(id, 'Play Solo', () => this.showDoc(id), () => this.closeDoc(id));
      this.showDoc(id);
      this.print('Play Solo is running. Close its tab or press Stop to end it.', 'info');
      this.debugger.sendBreakpoints();
    } else {
      if (m.error) this.print('Play Solo: ' + m.error, 'err');
      if (this.playing) this.endPlaySolo(false);
    }
    this.refreshUI();
  }

  sendDebug(msg) {
    if (this.team && this.team.open) this.team.send(msg);
    else if (this.solo && this.solo.readyState === 1) this.solo.send(JSON.stringify(msg));
  }

  endPlaySolo(notify = true) {
    const was = this.playing;
    this.playing = null;
    this.debugger.stopped();
    if (this.docs.has('play')) this.closeDoc('play', true);
    if (notify && was) {
      if (this.team && this.team.open) this.team.send({ t: 'playsolo', on: false });
      else if (this.solo && this.solo.readyState === 1) this.solo.send(JSON.stringify({ t: 'playsolo', on: false }));
    }
    if (was) this.print('Play Solo stopped', 'info');
    this.refreshUI();
  }

  async runCommand(code) {
    this.print('> ' + code);
    try {
      if (!this.lua.host) this.print('Starting Lua...');
      await this.lua.run(code, 'Command');
    } catch (e) {
      this.print(String(e.message || e), 'err');
    }
  }

  runScriptFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lua,.luau,.txt';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) return this.print('That script is too large to run', 'err');
      this.print(`Running ${f.name}`);
      await this.lua.run(await f.text(), f.name.replace(/\.[^.]+$/, '')).catch((e) => this.print(String(e.message || e), 'err'));
    });
    input.click();
  }

  pluginIcon(icon) {
    if (this.pluginIcons.has(icon)) return this.pluginIcons.get(icon);
    const m = /(?:[?&]id=|rbxassetid:\/\/)(\d+)/.exec(String(icon));
    const p = m ? assetBytes(+m[1]).then((b) => URL.createObjectURL(new Blob([b]))).catch(() => null) : Promise.resolve(/^https?:|^data:/.test(icon) ? icon : null);
    this.pluginIcons.set(icon, p);
    return p;
  }

  async managePlugins() {
    const lua = this.lua;
    const list = lua.installed();
    const res = await this.ui.dialog('Manage Plugins', (body) => {
      el('div', null, body, 'Plugins are Roblox plugin models, installed by asset ID. They run in this browser for your account only, and can change the place like the command bar does.').style.marginBottom = '8px';
      const rows = el('div', 'st-plugin-list', body);
      const state = list.slice();
      const draw = () => {
        rows.replaceChildren();
        if (!state.length) el('div', 'st-gs-note', rows, 'No plugins installed.');
        state.forEach((p, i) => {
          const r = el('div', 'st-plugin-row', rows);
          el('span', null, r, `${p.name || 'Plugin'} (${p.id})`);
          const x = el('button', null, r, 'Remove');
          x.addEventListener('click', () => {
            state.splice(i, 1);
            draw();
          });
        });
      };
      draw();
      const add = el('div', 'st-plugin-add', body);
      const id = el('input', null, add);
      id.placeholder = 'Asset ID';
      id.inputMode = 'numeric';
      const name = el('input', null, add);
      name.placeholder = 'Name (optional)';
      const b = el('button', null, add, 'Add');
      b.addEventListener('click', () => {
        const n = parseInt(id.value, 10);
        if (!(n > 0) || state.some((p) => +p.id === n)) return;
        state.push({ id: n, name: name.value.trim().slice(0, 60) || `Plugin ${n}` });
        id.value = name.value = '';
        draw();
      });
      return () => state;
    }, [['Save and Reload', true], ['Cancel', null]]);
    if (!res) return;
    lua.saveInstalled(res);
    lua.unloadPlugins();
    await lua.loadPlugins();
    this.ui.refreshPlugins();
  }

  joinTeamTest() {
    const url = endpointUrl('play', this.cfg.placeId);
    if (!url || !this.team || !this.team.test) return;
    const w = window.open(`${url}${url.includes('?') ? '&' : '?'}server=${encodeURIComponent('job:' + this.team.test)}`, '_blank');
    if (!w) this.ui.alert('Team Test', 'Your browser blocked the Team Test window. Allow pop-ups for this site, then choose Team Test again.');
  }

  async gameSettings() {
    const url = endpointUrl('studioSettings', this.cfg.placeId);
    if (!url) return window.open(endpointUrl('gamePage', this.cfg.placeId), '_blank');
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const cur = await r.json().catch(() => ({}));
    if (!r.ok || !cur.success) throw new Error(cur.error || `Game Settings could not be loaded (${r.status})`);
    const ro = !cur.canEdit;
    const next = await this.ui.dialog('Game Settings', (body) => {
      body.classList.add('st-gs');
      const nav = el('div', 'st-gs-nav', body);
      const pages = el('div', 'st-gs-pages', body);
      const tabs = [];
      const page = (name) => {
        const t = el('div', 'st-gs-tab', nav, name);
        const pg = el('div', 'st-gs-page', pages);
        tabs.push([t, pg]);
        t.addEventListener('click', () => {
          for (const [a, b] of tabs) {
            a.classList.toggle('active', a === t);
            b.hidden = b !== pg;
          }
        });
        return pg;
      };
      const field = (pg, label, input) => {
        const row = el('label', 'st-gs-field', pg);
        el('span', null, row, label);
        row.appendChild(input);
        input.disabled = ro;
        return input;
      };
      const basic = page('Basic Info');
      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 50;
      name.value = cur.name;
      field(basic, 'Name', name);
      const desc = document.createElement('textarea');
      desc.rows = 6;
      desc.maxLength = 1000;
      desc.value = cur.description;
      field(basic, 'Description', desc);
      const opts = page('Options');
      const max = document.createElement('input');
      max.type = 'number';
      max.min = '1';
      max.max = '50';
      max.value = String(cur.maxPlayers);
      field(opts, 'Max Players', max);
      const ver = document.createElement('select');
      for (const v of cur.clientVersions || [2012, 2018]) el('option', null, ver, `${v} client`).value = String(v);
      ver.value = String(cur.clientVersion);
      field(opts, 'Client', ver);
      const check = (pg, label, on) => {
        const row = el('label', 'st-gs-check', pg);
        const c = el('input', null, row);
        c.type = 'checkbox';
        c.checked = !!on;
        c.disabled = ro;
        el('span', null, row, label);
        return c;
      };
      const gear = check(opts, 'Allow players to use their gear', cur.allowGear);
      const avatarPg = page('Avatar');
      const av = document.createElement('select');
      for (const [v, l] of [['player', 'Player Choice'], ['R6', 'R6'], ['R15', 'R15']]) el('option', null, av, l).value = v;
      av.value = cur.avatarType;
      field(avatarPg, 'Avatar Type', av);
      const avNote = el('div', 'st-gs-note', avatarPg);
      const syncAv = () => {
        const old = ver.value !== '2018';
        av.disabled = ro || old;
        avNote.textContent = old ? 'The 2012 client always uses R6 characters.' : 'R15 characters use the player\'s body scale.';
      };
      ver.addEventListener('change', syncAv);
      syncAv();
      const perm = page('Permissions');
      const team = check(perm, 'Team Create (collaborators can edit this place with you)', cur.teamCreate);
      el('div', 'st-gs-note', perm, 'Add or remove collaborators in the Team Create window. Changes to Team Create apply the next time Studio is opened.');
      if (ro) el('div', 'st-gs-note st-gs-ro', body, 'Only the owner can change these settings.');
      tabs[0][0].click();
      return () => ({ name: name.value.trim(), description: desc.value, maxPlayers: Math.max(1, Math.min(50, +max.value || 20)), clientVersion: +ver.value, allowGear: gear.checked, teamCreate: team.checked, avatarType: av.value });
    }, ro ? [['Close', null]] : [['Save', true], ['Cancel', null]]);
    if (!next) return;
    const w = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.cfg.csrf || '' },
      body: JSON.stringify(next),
    });
    const res = await w.json().catch(() => ({}));
    if (!w.ok || !res.success) {
      this.ui.alert('Game Settings', res.error || `Settings were not saved (${w.status})`);
      return;
    }
    if (res.name && res.name !== this.cfg.placeName) {
      this.cfg.placeName = res.name;
      this.ui.setTitle(`${res.name}${this.dirty ? '*' : ''} - Studio`);
      const t = this.ui.tabs.querySelector('[data-id="place"] span');
      if (t) t.textContent = res.name;
    }
    this.print('Game settings saved', 'info');
    if ((res.clientVersion === 2018) !== (this.era === 2018)) this.print(`This place now plays in the ${res.clientVersion} client. Reopen Studio to edit it with the ${res.clientVersion} tools.`, 'info');
  }

  async insertService() {
    const list = this.era === 2018 ? INSERTABLE_SERVICES_2018 : ['Teams', 'SoundService', 'Debris', 'StarterGui', 'StarterPack', 'Lighting'];
    const shown = new Set(this.explorer.roots());
    const missing = list.filter((s) => isService(s) && (!this.dm.services.get(s) || !shown.has(this.dm.services.get(s))));
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
    svc.keepService = true;
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
      ed.onCommand = (cmd) => this.exec(cmd);
      ed.onGutter = (line) => this.debugger.toggle(script, line);
      ed.setMarks(this.debugger.linesOf(script), 0);
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

  closeDoc(id, quiet = false) {
    const d = this.docs.get(id);
    if (!d) return;
    if (d.play && !quiet) return this.endPlaySolo(true);
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
      if (ctrl && e.shiftKey && k === 'f') {
        e.preventDefault();
        this.exec('findall');
        return;
      }
      if (ctrl && e.shiftKey && k === 'x') {
        e.preventDefault();
        if (this.ui.mobile()) this.ui.showSheet('explorer');
        else this.ui.togglePane('explorer', true);
        this.explorer.focusSearch();
        return;
      }
      if (!ctrl && e.key === 'F2' && this.selection.size) {
        e.preventDefault();
        this.exec('rename');
        return;
      }
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

  csgCopy(src, dst) {
    for (const k of ['Anchored', 'CanCollide', 'Material', 'Reflectance', 'Transparency', 'BrickColor', 'Color', 'Locked', 'CastShadow']) {
      if (src.info.all.has(k) && dst.info.all.has(k)) dst.props.set(k, cloneVal(src.props.get(k)));
    }
  }

  csgPayload(list, frame) {
    const inv = C.inv(frame);
    const saved = [];
    for (const p of list) for (const d of [p, ...p.descendants()]) {
      if (!d.isA || !d.isA('BasePart')) continue;
      saved.push([d, d.props.get('CFrame')]);
      d.props.set('CFrame', C.mul(inv, d.props.get('CFrame')));
    }
    let xml;
    try {
      xml = writeModel(this.dm, list);
    } finally {
      for (const [d, cf] of saved) d.props.set('CFrame', cf);
    }
    return btoa(unescape(encodeURIComponent(xml)));
  }

  makeOperation(cls, name, frame, size, data, payload, like) {
    const op = this.dm.create(cls, null);
    op.props.set('Name', name);
    if (like) this.csgCopy(like, op);
    op.props.set('CFrame', frame);
    op.props.set('Size', size.slice());
    if (op.info.all.has('InitialSize')) op.props.set('InitialSize', size.slice());
    op.extra = new Map([
      ['MeshData', { t: 'raw', v: `<BinaryString name="MeshData">${data}</BinaryString>` }],
      ['ChildData', { t: 'raw', v: `<BinaryString name="ChildData">${payload}</BinaryString>` }],
    ]);
    for (const k of ['Name', 'CFrame', 'Size', 'InitialSize', 'Anchored', 'CanCollide', 'Material', 'Transparency', 'BrickColor', 'Color']) if (op.info.all.has(k)) this.touch(op, k);
    return op;
  }

  swapIn(olds, news, label) {
    const parent = olds[0].parent;
    const was = olds.map((p) => [p, p.parent]);
    for (const p of olds) this.reparentRaw(p, null);
    for (const n of news) this.reparentRaw(n, n.csgParent || parent);
    const placed = news.map((n) => [n, n.parent]);
    this.record(label, () => {
      for (const [n] of placed) this.reparentRaw(n, null);
      for (const [p, par] of was) this.reparentRaw(p, par);
      this.select(olds);
    }, () => {
      for (const p of olds) this.reparentRaw(p, null);
      for (const [n, par] of placed) this.reparentRaw(n, par);
      this.select(news);
    });
    this.select(news);
  }

  csgUnion(sel) {
    const parts = [...new Set(sel.flatMap(partsOf))].filter((p) => p.isA('BasePart'));
    if (parts.length < 2 && !parts.some((p) => p.ClassName === 'NegateOperation')) throw new Error('Select two or more parts to union');
    this.ui.status('Making union...');
    const r = solid(parts);
    const frame = C.cf(r.center[0], r.center[1], r.center[2]);
    const tops = sel.filter((s) => !sel.some((o) => o !== s && s.isDescendantOf(o)));
    const like = parts.find((p) => p.ClassName !== 'NegateOperation');
    const u = this.makeOperation('UnionOperation', 'Union', frame, r.size, r.data, this.csgPayload(tops, frame), like);
    u.csgMesh = r.mesh;
    this.swapIn(tops, [u], 'Union');
    this.ui.status(`Union made from ${parts.length} parts`);
  }

  csgNegate(sel) {
    const parts = sel.filter((p) => p.isA && p.isA('BasePart'));
    if (!parts.length) throw new Error('Select parts to negate');
    const out = [];
    for (const p of parts) {
      if (p.ClassName === 'NegateOperation') {
        const back = this.unpackChildren(p);
        if (back) {
          this.swapIn([p], back, 'Negate');
          out.push(...back);
        }
        continue;
      }
      const shape = shapeOf(p);
      if (!shape) continue;
      const n = this.makeOperation('NegateOperation', p.props.get('Name'), p.props.get('CFrame').slice(), p.props.get('Size'), shape.data, this.csgPayload([p], p.props.get('CFrame')), p);
      n.csgMesh = shape.mesh;
      this.swapIn([p], [n], 'Negate');
      out.push(n);
    }
    this.select(out);
  }

  unpackChildren(op) {
    const raw = op.extra && op.extra.get('ChildData');
    const b64 = raw && typeof raw.v === 'string' ? raw.v.replace(/<[^>]*>/g, '').trim() : '';
    if (!b64) return null;
    let xml;
    try {
      xml = decodeURIComponent(escape(atob(b64)));
    } catch {
      return null;
    }
    if (!/^\s*<roblox/.test(xml)) return null;
    const made = this.dm.load(parsePlace(xml), null, { track: true });
    const tops = made.filter((m) => !m.parent);
    const frame = op.props.get('CFrame');
    const init = op.info.all.has('InitialSize') ? op.props.get('InitialSize') : null;
    const size = op.props.get('Size');
    const k = Array.isArray(init) && init.every((v) => v > 0) ? [size[0] / init[0], size[1] / init[1], size[2] / init[2]] : [1, 1, 1];
    for (const t of tops) for (const d of [t, ...t.descendants()]) {
      if (!d.isA || !d.isA('BasePart')) continue;
      const rel = d.props.get('CFrame').slice();
      rel[0] *= k[0];
      rel[1] *= k[1];
      rel[2] *= k[2];
      d.props.set('CFrame', C.mul(frame, rel));
      for (const name of ['CFrame']) this.touch(d, name);
    }
    for (const t of tops) t.csgParent = op.parent;
    return tops;
  }

  csgSeparate(sel) {
    const ops = sel.filter((p) => p.isA && p.isA('PartOperation'));
    if (!ops.length) throw new Error('Select a union to separate');
    const out = [];
    for (const op of ops) {
      const back = this.unpackChildren(op);
      if (!back) {
        this.print(`${op.props.get('Name')} was made outside this Studio, so its parts cannot be separated here`, 'err');
        continue;
      }
      this.swapIn([op], back, 'Separate');
      out.push(...back);
    }
    if (out.length) this.select(out);
  }

  replacePlace(nodes, label) {
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
    this.print(`Opened ${label}`, 'info');
  }

  openFile(into = null) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = into ? '.rbxm,.rbxmx' : '.rbxl,.rbxlx,.rbxm,.rbxmx';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const nodes = parsePlace(bytes);
      const isPlace = !into && nodes.some((n) => n.cls === 'Workspace');
      if (isPlace) {
        const ok = await this.ui.confirm('Open', `Replace everything in this place with ${f.name}? You can still leave without saving.`);
        if (!ok) return;
        this.replacePlace(nodes, f.name);
      } else {
        const ws = into && into.parent ? into : this.dm.services.get('Workspace');
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
    if (this.era === 2018 && (endpointUrl('studioTestTicket', this.cfg.placeId) || (this.team && this.team.open))) return this.startPlaySolo();
    if (this.dirty) {
      const ok = await this.ui.confirm('Play Solo', 'Save the place and open it in a new tab to test it?');
      if (!ok) return;
      if (!(await this.save())) return;
    }
    window.open(endpointUrl('play', this.cfg.placeId), '_blank');
  }
}

export { SERVICES };
