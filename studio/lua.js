import { ScriptHost, T } from '../shared/luahost.js';
import { FLAGS_2018 } from '../shared/api2018.js';
import { publicPath, assetBytes } from '../client/assets.js';
import { parsePlace } from '../shared/rbxl.js';
import { Gui } from '../client/gui.js';
import { el } from './ui.js';
import { partsOf } from './view.js';

const PLUGINS_KEY = 'chocolate-studio-plugins';
const PLUGIN_SETTINGS = 'chocolate-plugin-setting:';
const IDLE_COMMIT = 0.6;

const EXT = `
local R = ...
local base, sandbox = R.base, R.sandbox
local function new(state, enabled, override, fx, fy, mx, my)
  return { InitialEnabled = enabled and true or false, InitialEnabledShouldOverrideRestore = override and true or false, FloatingXSize = fx or 0, FloatingYSize = fy or 0, MinWidth = mx or 0, MinHeight = my or 0 }
end
local api = { new = new }
base.DockWidgetPluginGuiInfo = api
sandbox.DockWidgetPluginGuiInfo = api
`;

const u = (x) => (x && typeof x === 'object' && 'tag' in x ? x.v : x);

class WidgetGui extends Gui {
  constructor(root, dm, renderer, widget) {
    super(root, { dm, player: null, guiInset: [0, 0, 0, 0], guiScale: () => 1, touch: false, noTopbar: true }, renderer, { send: () => {} });
    this.widget = widget;
    this.overlay.classList.add('st-gui', 'st-widget-gui');
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
    return this.widget && !this.widget.destroyed ? [this.widget] : [];
  }
}

export class StudioLua {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.starting = null;
    this.inLua = false;
    this.rec = null;
    this.idle = 0;
    this.t = 0;
    this.toolbars = [];
    this.widgets = new Map();
    this.mice = new Map();
    this.active = null;
    this.plugins = [];
  }

  ensure() {
    if (!this.starting) this.starting = this.boot().catch((e) => {
      this.starting = null;
      throw e;
    });
    return this.starting;
  }

  async boot() {
    const app = this.app;
    const v = app.cfg.version ? '?v=' + app.cfg.version : '';
    const [{ Lua }, src, ext2018] = await Promise.all([
      import('wasmoon-lua5.1'),
      fetch(publicPath('/shared/runtime.lua' + v)).then((r) => r.text()),
      app.era === 2018 ? fetch(publicPath('/shared/runtime2018.lua' + v)).then((r) => r.text()) : Promise.resolve(null),
    ]);
    const host = new ScriptHost(app.dm, this.env());
    if (app.era === 2018) host.flags = FLAGS_2018;
    const exts = [];
    if (ext2018) exts.push({ source: ext2018, name: 'runtime2018' });
    exts.push({ source: EXT, name: 'studio' });
    await host.init(() => Lua.create({ customWasmUri: publicPath('/client/vendor/liblua5.1.wasm') }), src, exts);
    this.host = host;
    this.addMethods();
    app.dm.observe({
      changed: (inst, name, old) => this.noteChange(inst, name, old),
      reparented: (inst, old) => this.noteMove(inst, old),
    });
    app.dm.service('Selection');
    app.dm.service('ChangeHistoryService');
    return host;
  }

  env() {
    const app = this.app;
    return {
      log: (kind, msg) => {
        app.print(String(msg), kind === 'error' ? 'err' : kind === 'warn' ? 'warn' : '');
        if (kind === 'error' && app.debugger) app.debugger.noteError(msg);
      },
      localPlayer: () => null,
      loadAsset: async (id) => {
        const bytes = await assetBytes(id);
        const model = app.dm.create('Model', null);
        model.props.set('Name', 'Model');
        app.dm.load(parsePlace(bytes), model, { track: true });
        return model;
      },
      linkedSource: async (url) => {
        const m = /[?&]id=(\d+)/.exec(String(url));
        return m ? new TextDecoder().decode(await assetBytes(+m[1])) : '';
      },
    };
  }

  inGame(inst) {
    for (let p = inst; p; p = p.parent) if (p === this.app.dm.root) return true;
    return false;
  }

  noteChange(inst, name, old) {
    if (!this.inLua || name === 'AbsoluteSize' || name === 'AbsolutePosition' || !this.inGame(inst)) return;
    if (!this.rec) this.rec = { props: new Map(), parents: new Map() };
    let m = this.rec.props.get(inst);
    if (!m) this.rec.props.set(inst, (m = new Map()));
    if (!m.has(name)) m.set(name, Array.isArray(old) ? old.slice() : old);
    this.app.touch(inst, name);
    this.idle = 0;
  }

  noteMove(inst, old) {
    if (!this.inLua) return;
    const now = this.inGame(inst), was = !!old && (old === this.app.dm.root || this.inGame(old));
    if (!now && !was) return;
    if (!this.rec) this.rec = { props: new Map(), parents: new Map() };
    if (!this.rec.parents.has(inst)) this.rec.parents.set(inst, old || null);
    this.idle = 0;
  }

  commit(label) {
    const rec = this.rec;
    this.rec = null;
    if (!rec || (!rec.props.size && !rec.parents.size)) return;
    const app = this.app;
    const props = [...rec.props].map(([inst, m]) => [inst, [...m].map(([n, old]) => [n, old, cloneVal(inst.props.get(n))])]);
    const parents = [...rec.parents].map(([inst, old]) => [inst, old, inst.parent]);
    const apply = (forward) => {
      for (const [inst, list] of props) for (const [n, old, now] of list) app.setPropRaw(inst, n, cloneVal(forward ? now : old));
      for (const [inst, old, now] of forward ? parents : parents.slice().reverse()) app.reparentRaw(inst, forward ? now : old);
      app.selectionChanged();
    };
    app.record(label || 'Command', () => apply(false), () => apply(true));
  }

  tick(dt) {
    if (!this.host) return;
    this.t += dt;
    this.inLua = true;
    try {
      this.host.tick(this.t);
      if (this.host.renderStep) this.host.renderStep(dt);
    } finally {
      this.inLua = false;
    }
    if (this.rec) {
      this.idle += dt;
      if (this.idle >= IDLE_COMMIT) this.commit(this.recLabel);
    }
    for (const w of this.widgets.values()) if (w.pane && !w.pane.closed && w.gui) w.gui.layout();
  }

  startScript(script) {
    this.host.running.add(script.id);
    this.host.queue.push('start', script.id);
  }

  async run(source, name = 'Command') {
    await this.ensure();
    const app = this.app;
    const s = app.dm.create('Script', null);
    s.props.set('Name', name);
    s.props.set('Source', String(source));
    this.recLabel = name;
    this.startScript(s);
  }

  analyze() {
    const lua = this.host && this.host.lua;
    const out = [];
    if (!lua) return out;
    for (const d of this.app.dm.root.descendants()) {
      if (!['Script', 'LocalScript', 'ModuleScript'].includes(d.ClassName)) continue;
      const src = String(d.props.get('Source') || '');
      if (!src.trim()) continue;
      lua.global.set('__ASRC', src);
      lua.doStringSync('local f, e = loadstring(__ASRC, "=src") __AERR = e or false __ASRC = nil');
      const err = lua.global.get('__AERR');
      lua.doStringSync('__AERR = nil');
      if (err) {
        const m = /^src:(\d+):\s*(.*)$/.exec(String(err));
        out.push({ script: d, line: m ? +m[1] : 0, msg: m ? m[2] : String(err) });
      }
      const globals = [...src.matchAll(/\b(wait|spawn|delay)\s*\(/g)].length;
      if (globals > 200) out.push({ script: d, line: 0, msg: `${globals} calls to wait, spawn or delay`, warn: true });
    }
    return out;
  }

  installed() {
    try {
      const list = JSON.parse(localStorage.getItem(PLUGINS_KEY) || '[]');
      return Array.isArray(list) ? list.filter((x) => x && +x.id > 0) : [];
    } catch {
      return [];
    }
  }

  saveInstalled(list) {
    try {
      localStorage.setItem(PLUGINS_KEY, JSON.stringify(list));
    } catch {}
  }

  async loadPlugins() {
    const list = this.installed();
    if (!list.length) return;
    await this.ensure();
    for (const p of list) await this.loadPlugin(p).catch((e) => this.app.print(`Plugin ${p.name || p.id} failed to load: ${e.message}`, 'err'));
  }

  async loadPlugin(entry) {
    const app = this.app;
    const bytes = await assetBytes(+entry.id);
    if (!new TextDecoder().decode(bytes.subarray(0, 8)).startsWith('<roblox')) throw new Error('that asset is not a plugin model');
    const pl = app.dm.create('Plugin', null);
    pl.props.set('Name', entry.name || `Plugin ${entry.id}`);
    pl.pluginId = +entry.id;
    app.dm.load(parsePlace(bytes), pl, { track: true });
    const scripts = pl.descendants().filter((d) => d.ClassName === 'Script' && !d.props.get('Disabled'));
    if (!scripts.length) throw new Error('the model has no Script to run');
    for (const s of scripts) {
      s.props.set('Source', 'local plugin = script:FindFirstAncestorOfClass("Plugin") ' + String(s.props.get('Source') || ''));
      this.startScript(s);
    }
    this.plugins.push(pl);
    app.print(`Loaded plugin ${pl.props.get('Name')}`, 'info');
  }

  unloadPlugins() {
    const app = this.app;
    for (const pl of this.plugins) {
      if (this.host) for (const d of pl.descendants()) if (this.host.running.has(d.id)) this.host.stopScript(d);
      if (!pl.destroyed) app.dm.destroy(pl, true);
    }
    this.plugins = [];
    this.toolbars = [];
    for (const w of this.widgets.values()) if (w.paneId) app.ui.togglePane(w.paneId, false);
    this.widgets.clear();
    this.mice.clear();
    this.active = null;
    app.ui.refreshPlugins && app.ui.refreshPlugins();
  }

  clickButton(btn) {
    if (btn.destroyed || btn.props.get('Enabled') === false) return;
    this.app.dm.emit(btn, 'Click');
  }

  activePluginMouse() {
    return this.active && !this.active.destroyed ? this.mice.get(this.active) : null;
  }

  pointer(kind, e, view) {
    const mouse = this.activePluginMouse();
    if (!mouse) return false;
    const hit = view.pick(e, {});
    const rect = view.el.getBoundingClientRect();
    mouse.props.set('X', Math.round(e.clientX - rect.left));
    mouse.props.set('Y', Math.round(e.clientY - rect.top));
    mouse.props.set('ViewSizeX', Math.round(rect.width));
    mouse.props.set('ViewSizeY', Math.round(rect.height));
    mouse.props.set('Target', hit.part || null);
    if (hit.point) mouse.props.set('Hit', [hit.point[0], hit.point[1], hit.point[2], 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.app.dm.emit(mouse, kind);
    return true;
  }

  addMethods() {
    const app = this.app, dm = app.dm, M = this.host.methods;
    const def = (names, cls, fn) => {
      for (const n of names.split(' ')) {
        if (!M.has(n)) M.set(n, []);
        M.get(n).unshift([cls, fn]);
      }
    };
    const pluginOf = (i) => {
      for (let p = i; p; p = p.parent) if (p.ClassName === 'Plugin') return p;
      return null;
    };
    def('CreateToolbar', 'Plugin', (pl, [name]) => {
      const tb = dm.create('PluginToolbar', pl);
      tb.props.set('Name', String(u(name) || 'Plugin'));
      this.toolbars.push(tb);
      app.ui.refreshPlugins && app.ui.refreshPlugins();
      return tb;
    });
    def('CreateButton', 'PluginToolbar', (tb, [id, tip, icon, text]) => {
      const b = dm.create('PluginToolbarButton', tb);
      b.props.set('Name', String(u(id) || 'Button'));
      b.tooltip = String(u(tip) || '');
      b.icon = String(u(icon) || '');
      b.text = String(u(text) || u(id) || '');
      app.ui.refreshPlugins && app.ui.refreshPlugins();
      return b;
    });
    def('SetActive', 'PluginToolbarButton', (b, [on]) => {
      b.active = !!u(on);
      app.ui.refreshPlugins && app.ui.refreshPlugins();
      return null;
    });
    def('GetMouse', 'Plugin', (pl) => {
      let m = this.mice.get(pl);
      if (!m) {
        m = dm.create('PluginMouse', pl);
        m.props.set('Name', 'PluginMouse');
        this.mice.set(pl, m);
      }
      return m;
    });
    def('Activate', 'Plugin', (pl) => {
      if (this.active && this.active !== pl && !this.active.destroyed) dm.emit(this.active, 'Deactivation');
      this.active = pl;
      return null;
    });
    def('Deactivate', 'Plugin', (pl) => {
      if (this.active === pl) {
        this.active = null;
        dm.emit(pl, 'Deactivation');
      }
      return null;
    });
    def('IsActivated', 'Plugin', (pl) => this.active === pl);
    def('GetSetting', 'Plugin', (pl, [k]) => {
      try {
        const raw = localStorage.getItem(PLUGIN_SETTINGS + (pl.pluginId || 0) + ':' + String(u(k)));
        return raw == null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    });
    def('SetSetting', 'Plugin', (pl, [k, v]) => {
      try {
        const val = u(v);
        localStorage.setItem(PLUGIN_SETTINGS + (pl.pluginId || 0) + ':' + String(u(k)), JSON.stringify(typeof val === 'object' ? null : val));
      } catch {}
      return null;
    });
    def('GetStudioUserId', 'Plugin', () => app.cfg.userId | 0);
    def('OpenScript', 'Plugin', (pl, [s]) => {
      const sc = u(s);
      if (sc && sc.isA && sc.isA('LuaSourceContainer')) app.openScript(sc);
      return null;
    });
    def('Union', 'Plugin', (pl, [list]) => {
      const sel = (u(list) || []).map(u).filter(Boolean);
      app.select(sel);
      app.csgUnion(sel);
      return [...app.selection][0] || null;
    });
    def('Negate', 'Plugin', (pl, [list]) => {
      app.csgNegate((u(list) || []).map(u).filter(Boolean));
      return T.list([...app.selection]);
    });
    def('Separate', 'Plugin', (pl, [list]) => {
      app.csgSeparate((u(list) || []).map(u).filter(Boolean));
      return T.list([...app.selection]);
    });
    def('CreateDockWidgetPluginGui', 'Plugin', (pl, [id, info]) => {
      const key = String(u(id) || 'Widget');
      const old = this.widgets.get(key);
      if (old && !old.widget.destroyed) return old.widget;
      const w = dm.create('DockWidgetPluginGui', null);
      w.props.set('Name', key);
      const inf = u(info) || {};
      const enabled = !!u(inf.InitialEnabled);
      if (w.info.all.has('Enabled')) w.props.set('Enabled', enabled);
      const rec = { widget: w, paneId: 'plugin:' + key, pane: null, gui: null };
      const body = app.ui.addPane(rec.paneId, key, 'right');
      rec.pane = app.ui.panes.get(rec.paneId);
      rec.pane.body.classList.add('st-widget-body');
      rec.gui = new WidgetGui(body, app.dm, app.r, w);
      app.ui.togglePane(rec.paneId, enabled);
      this.widgets.set(key, rec);
      dm.observe({
        changed: (inst, name) => {
          if (inst !== w) return;
          if (name === 'Enabled') app.ui.togglePane(rec.paneId, !!w.props.get('Enabled'));
          if (name === 'Title' && rec.pane) rec.pane.el.querySelector('.st-pane-caption').firstChild.textContent = String(w.props.get('Title'));
        },
      });
      return w;
    });
    def('Get', 'Selection', () => T.list([...app.selection]));
    def('Set', 'Selection', (s, [list]) => {
      app.select((u(list) || []).map(u).filter((x) => x && x.isA && this.inGame(x)));
      return null;
    });
    def('Add', 'Selection', (s, [list]) => {
      app.select([...app.selection, ...(u(list) || []).map(u).filter((x) => x && x.isA && this.inGame(x))]);
      return null;
    });
    def('Remove', 'Selection', (s, [list]) => {
      const drop = new Set((u(list) || []).map(u));
      app.select([...app.selection].filter((x) => !drop.has(x)));
      return null;
    });
    def('SetWaypoint', 'ChangeHistoryService', (s, [name]) => {
      this.commit(String(u(name) || 'Plugin'));
      return null;
    });
    def('Undo', 'ChangeHistoryService', () => {
      app.undo();
      return null;
    });
    def('Redo', 'ChangeHistoryService', () => {
      app.redo();
      return null;
    });
    def('ResetWaypoints SetEnabled', 'ChangeHistoryService', () => null);
    def('GetCanUndo', 'ChangeHistoryService', () => app.undoStack.length > 0);
    def('GetCanRedo', 'ChangeHistoryService', () => app.redoStack.length > 0);
    def('SaveSelectedToRoblox PromptSaveSelection', 'Plugin', () => {
      const list = [...app.selection];
      if (list.length) app.saveModel(list);
      return null;
    });
    def('GetSelectedParts', 'Plugin', () => T.list([...app.selection].flatMap(partsOf)));
  }
}

function cloneVal(v) {
  return Array.isArray(v) ? v.slice() : v;
}

export function analysisPane(app, lua) {
  if (!app.analysisBody) {
    const body = app.ui.addPane('analysis', 'Script Analysis', 'bottom');
    app.analysisBody = el('div', 'st-findresults', body);
  }
  app.ui.togglePane('analysis', true);
  const box = app.analysisBody;
  box.replaceChildren();
  const res = lua.analyze();
  el('div', 'info', box, res.length ? `${res.length} problem${res.length === 1 ? '' : 's'}` : 'No problems found');
  for (const r of res) {
    const row = el('div', 'st-findhit' + (r.warn ? ' warn' : ' err'), box, `${r.script.props.get('Name')}${r.line ? ':' + r.line : ''}  ${r.msg}`);
    row.addEventListener('click', () => {
      app.openScript(r.script);
      if (r.line) app.extras.gotoLineNumber(r.line);
    });
  }
}
