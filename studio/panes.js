import { el, classIconStyle } from './ui.js';
import { brick, brickPalette, brickList } from '../shared/brickcolor.js';
import { ENUMS, isCreatable, CLASSES } from '../shared/classes.js';

const CLASS_ICON = {
  Part: 1, WedgePart: 1, CornerWedgePart: 1, TrussPart: 1, Terrain: 1, Model: 2, Status: 2, StringValue: 4, IntValue: 4, NumberValue: 4, BoolValue: 4,
  ObjectValue: 4, Vector3Value: 4, CFrameValue: 4, Color3Value: 4, BrickColorValue: 4, RayValue: 4, IntConstrainedValue: 4, DoubleConstrainedValue: 4,
  Camera: 5, Script: 6, Decal: 7, SpecialMesh: 8, BlockMesh: 8, CylinderMesh: 8, FileMesh: 8, CharacterMesh: 8, Humanoid: 9, Texture: 10, Sound: 11,
  Player: 12, Lighting: 13, BodyGyro: 14, BodyPosition: 14, BodyVelocity: 14, BodyForce: 14, BodyThrust: 14, BodyAngularVelocity: 14, RocketPropulsion: 14,
  Tool: 17, LocalScript: 18, Workspace: 19, StarterPack: 20, Players: 21, HopperBin: 22, Teams: 23, Team: 24, SpawnLocation: 25, Sky: 28, Debris: 30,
  SoundService: 31, Hint: 33, Message: 33, Weld: 34, Snap: 34, Glue: 34, ManualWeld: 34, ManualGlue: 34, Motor: 34, Motor6D: 34, VelocityMotor: 34, Rotate: 34,
  RotateP: 34, RotateV: 34, Seat: 35, VehicleSeat: 35, SkateboardPlatform: 35, Explosion: 36, ForceField: 37, Flag: 38, FlagStand: 39, ShirtGraphic: 40,
  ClickDetector: 41, Sparkles: 42, Shirt: 43, Pants: 44, Hat: 45, StarterGui: 46, ScreenGui: 47, Frame: 48, ImageLabel: 49, TextLabel: 50, TextButton: 51,
  TextBox: 51, ImageButton: 52, Handles: 53, SelectionBox: 54, ArcHandles: 56, Backpack: 58, Configuration: 58, Smoke: 59, Animation: 60, Fire: 61,
  Dialog: 62, DialogChoice: 63, BillboardGui: 64, BodyColors: 26, Pose: 60, Keyframe: 60,
};

const VISIBLE_SERVICES = ['Workspace', 'Players', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService', 'Chat', 'Debris'];

export function classIcon(cls) {
  return CLASS_ICON[cls] ?? 0;
}

const CATEGORY = {
  BrickColor: 'Appearance', Material: 'Appearance', Reflectance: 'Appearance', Transparency: 'Appearance', Color: 'Appearance', TextureId: 'Appearance', Texture: 'Appearance',
  Name: 'Data', ClassName: 'Data', Parent: 'Data', Position: 'Data', Velocity: 'Data', RotVelocity: 'Data', Value: 'Data', CFrame: 'Data', Source: 'Data',
  Anchored: 'Behavior', CanCollide: 'Behavior', Locked: 'Behavior', Disabled: 'Behavior', Archivable: 'Behavior', LinkedSource: 'Behavior',
  FormFactor: 'Part', Shape: 'Part', Size: 'Part', Elasticity: 'Part', Friction: 'Part',
};
const CATEGORY_ORDER = ['Appearance', 'Data', 'Behavior', 'Part', 'Surface Inputs', 'Surface', 'Other'];
const HIDDEN = new Set(['CFrame', 'RobloxLocked', 'Archivable', 'DistributedGameTime', 'LocalPlayer', 'NumPlayers', 'JobId', 'PlaceId', 'CreatorId', 'GameId']);

function category(name) {
  if (CATEGORY[name]) return CATEGORY[name];
  if (/Surface$/.test(name)) return 'Surface';
  if (/(SurfaceInput|ParamA|ParamB)$/.test(name)) return 'Surface Inputs';
  return 'Other';
}

function fmt(n) {
  return String(Number(Number(n).toPrecision(6)));
}

export function formatValue(type, v) {
  switch (type) {
    case 'V3': return v.map(fmt).join(', ');
    case 'V2': return v.map(fmt).join(', ');
    case 'C3': return v.map((x) => Math.round(x * 255)).join(', ');
    case 'UD2': return `{${fmt(v[0])}, ${v[1]}}, {${fmt(v[2])}, ${v[3]}}`;
    case 'UD': return `${fmt(v[0])}, ${v[1]}`;
    case 'CF': return v.slice(0, 3).map(fmt).join(', ');
    case 'number': return fmt(v);
    case 'Ref': return v ? v.props.get('Name') : '';
    default: return v == null ? '' : String(v);
  }
}

export function parseValue(type, text, old) {
  const nums = String(text).split(/[\s,{}]+/).filter(Boolean).map(Number);
  switch (type) {
    case 'number': return Number.isFinite(+text) ? +text : old;
    case 'int': return Number.isFinite(+text) ? Math.trunc(+text) : old;
    case 'V3': return nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite) ? nums.slice(0, 3) : old;
    case 'V2': return nums.length >= 2 && nums.slice(0, 2).every(Number.isFinite) ? nums.slice(0, 2) : old;
    case 'C3': return nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite) ? nums.slice(0, 3).map((x) => Math.max(0, Math.min(255, x)) / 255) : old;
    case 'UD2': return nums.length >= 4 && nums.every(Number.isFinite) ? [nums[0], Math.trunc(nums[1]), nums[2], Math.trunc(nums[3])] : old;
    case 'UD': return nums.length >= 2 && nums.every(Number.isFinite) ? [nums[0], Math.trunc(nums[1])] : old;
    default: return String(text);
  }
}

export class Explorer {
  constructor(app, body) {
    this.app = app;
    this.body = body;
    this.open = new Set();
    this.tree = el('div', 'st-tree', body);
    this.dirty = true;
    body.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  expandTo(inst) {
    for (let p = inst.parent; p && p !== this.app.dm.root; p = p.parent) this.open.add(p);
    this.dirty = true;
  }

  roots() {
    const dm = this.app.dm;
    return dm.root.children.filter((c) => VISIBLE_SERVICES.includes(c.ClassName) && !c.studioHidden).sort((a, b) => VISIBLE_SERVICES.indexOf(a.ClassName) - VISIBLE_SERVICES.indexOf(b.ClassName));
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const sel = this.app.selection;
    const frag = document.createDocumentFragment();
    let count = 0;
    const row = (inst, depth) => {
      if (++count > 20000) return;
      const n = document.createElement('div');
      n.className = 'st-node' + (sel.has(inst) ? ' selected' : '');
      n.style.paddingLeft = depth * 16 + 'px';
      const kids = inst.children.filter((c) => !c.studioHidden);
      const tw = el('div', 'st-twisty' + (kids.length ? ' has' : '') + (this.open.has(inst) ? ' open' : ''), n);
      const ic = el('div', 'st-cicon', n);
      ic.style.cssText = classIconStyle(classIcon(inst.ClassName));
      el('span', 'st-label', n, inst.props.get('Name'));
      n._inst = inst;
      tw.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.open.has(inst)) this.open.delete(inst);
        else this.open.add(inst);
        this.dirty = true;
        this.render();
      });
      frag.appendChild(n);
      if (this.open.has(inst)) for (const c of kids) row(c, depth + 1);
    };
    for (const r of this.roots()) row(r, 0);
    this.tree.replaceChildren(frag);
    this.bind();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    let press = null;
    this.tree.addEventListener('pointerdown', (e) => {
      const n = e.target.closest('.st-node');
      if (!n || e.target.classList.contains('st-twisty')) return;
      const inst = n._inst;
      if (e.button === 2) {
        if (!this.app.selection.has(inst)) this.app.select([inst]);
        this.app.ui.contextMenu(this.app.selectionMenu(), e.clientX, e.clientY);
        return;
      }
      press = { inst, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, dragging: false, long: null };
      if (e.pointerType === 'touch') {
        press.long = setTimeout(() => {
          if (!press) return;
          if (!this.app.selection.has(inst)) this.app.select([inst]);
          this.app.ui.contextMenu(this.app.selectionMenu(), press.x, press.y);
          press = null;
        }, 550);
      }
    });
    this.tree.addEventListener('pointermove', (e) => {
      if (!press || press.id !== e.pointerId || e.pointerType === 'touch') return;
      if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        press.dragging = true;
        if (!this.app.selection.has(press.inst)) this.app.select([press.inst]);
      }
      if (press.dragging) {
        for (const x of this.tree.querySelectorAll('.drop')) x.classList.remove('drop');
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.st-node');
        if (over) over.classList.add('drop');
      }
    });
    const end = (e) => {
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.long);
      const p = press;
      press = null;
      for (const x of this.tree.querySelectorAll('.drop')) x.classList.remove('drop');
      if (p.dragging) {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.st-node');
        if (over && over._inst) this.app.reparent([...this.app.selection], over._inst);
        return;
      }
      if (e.type === 'pointercancel') return;
      const inst = p.inst;
      if (e.shiftKey && this.app.selection.size) {
        const flat = [...this.tree.querySelectorAll('.st-node')].map((x) => x._inst);
        const last = this.app.lastSelected;
        const a = flat.indexOf(last), b = flat.indexOf(inst);
        if (a >= 0 && b >= 0) this.app.select(flat.slice(Math.min(a, b), Math.max(a, b) + 1));
      } else if (e.ctrlKey || e.metaKey) this.app.toggleSelect(inst);
      else this.app.select([inst]);
      const now = performance.now();
      if (this.lastClick && this.lastClick.inst === inst && now - this.lastClick.t < 400) this.app.activate(inst);
      this.lastClick = { inst, t: now };
    };
    this.tree.addEventListener('pointerup', end);
    this.tree.addEventListener('pointercancel', end);
  }

  scrollTo(inst) {
    const n = [...this.tree.querySelectorAll('.st-node')].find((x) => x._inst === inst);
    if (n) n.scrollIntoView({ block: 'nearest' });
  }
}

export class Properties {
  constructor(app, body) {
    this.app = app;
    this.body = body;
    this.closed = new Set();
    this.table = el('table', 'st-props', body);
    this.dirty = true;
    this.editing = false;
  }

  render() {
    if (!this.dirty || this.editing) return;
    this.dirty = false;
    const sel = [...this.app.selection];
    this.table.replaceChildren();
    if (!sel.length) return;
    const first = sel[0];
    const names = [...first.info.all.keys()].filter((n) => !HIDDEN.has(n) && sel.every((s) => s.info.all.has(n)) && first.info.all.get(n).type !== 'any');
    const rows = names.map((n) => ({ name: n, info: first.info.all.get(n) }));
    rows.push({ name: 'ClassName', info: { type: 'readonly' } });
    if (first.parent !== undefined) rows.push({ name: 'Parent', info: { type: 'parent' } });
    if (first.isA('BasePart')) rows.push({ name: 'Position', info: { type: 'position' } });
    const groups = new Map();
    for (const r of rows) {
      const c = category(r.name);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(r);
    }
    for (const c of CATEGORY_ORDER) {
      const list = groups.get(c);
      if (!list) continue;
      list.sort((a, b) => a.name.localeCompare(b.name));
      const tr = el('tr', 'cat' + (this.closed.has(c) ? ' closed' : ''), this.table);
      const td = el('td', null, tr, c);
      td.colSpan = 2;
      tr.addEventListener('click', () => {
        if (this.closed.has(c)) this.closed.delete(c);
        else this.closed.add(c);
        this.dirty = true;
        this.render();
      });
      if (this.closed.has(c)) continue;
      for (const r of list) this.row(sel, r);
    }
  }

  row(sel, { name, info }) {
    const first = sel[0];
    const tr = el('tr', null, this.table);
    el('td', null, tr, name);
    const td = el('td', null, tr);
    const same = (get) => sel.every((s) => JSON.stringify(get(s)) === JSON.stringify(get(first)));
    if (info.type === 'readonly') {
      el('span', 'st-readonly', td, same((s) => s.ClassName) ? first.ClassName : '');
      return;
    }
    if (info.type === 'parent') {
      el('span', 'st-readonly', td, first.parent && first.parent !== this.app.dm.root ? first.parent.props.get('Name') : first.parent ? 'game' : '');
      return;
    }
    if (info.type === 'position') {
      const v = first.props.get('CFrame');
      this.text(td, same((s) => s.props.get('CFrame').slice(0, 3)) ? formatValue('V3', v.slice(0, 3)) : '', (t) => {
        const p = parseValue('V3', t, null);
        if (p) this.app.setPositions(sel, p);
      });
      return;
    }
    const get = (s) => s.props.get(name);
    const v = get(first);
    const uniform = same(get);
    const set = (val) => this.app.setProp(sel, name, val);
    switch (info.type) {
      case 'bool': {
        const c = el('input', null, td);
        c.type = 'checkbox';
        c.checked = uniform && !!v;
        c.indeterminate = !uniform;
        c.addEventListener('change', () => set(c.checked));
        break;
      }
      case 'enum': {
        const E = ENUMS[info.enumType];
        if (!E) {
          this.text(td, uniform ? String(v) : '', (t) => set(Math.trunc(+t) || 0));
          break;
        }
        const s = el('select', null, td);
        if (!uniform) el('option', null, s, '').value = '';
        for (const [k, n] of Object.entries(E)) {
          const o = el('option', null, s, k);
          o.value = n;
        }
        s.value = uniform ? String(v) : '';
        s.addEventListener('focus', () => (this.editing = true));
        s.addEventListener('blur', () => {
          this.editing = false;
          this.dirty = true;
        });
        s.addEventListener('change', () => {
          if (s.value !== '') set(+s.value);
        });
        break;
      }
      case 'BC': {
        const b = brick(v);
        const sw = el('span', 'st-swatch', td);
        sw.style.background = `rgb(${b.r * 255},${b.g * 255},${b.b * 255})`;
        const link = el('span', 'st-linkbtn', td, uniform ? b.name : '');
        link.addEventListener('click', async () => {
          const n = await this.app.pickBrickColor(v);
          if (n != null) set(n);
        });
        break;
      }
      case 'Ref':
        el('span', 'st-readonly', td, uniform ? formatValue('Ref', v) : '');
        break;
      case 'string':
        if (name === 'Source') {
          const link = el('span', 'st-linkbtn', td, 'Edit Script...');
          link.addEventListener('click', () => this.app.openScript(first));
          break;
        }
        this.text(td, uniform ? v : '', (t) => set(t));
        break;
      default:
        this.text(td, uniform ? formatValue(info.type, v) : '', (t) => {
          const val = parseValue(info.type, t, undefined);
          if (val !== undefined) set(val);
        });
    }
  }

  text(td, value, commit) {
    const i = el('input', null, td);
    i.type = 'text';
    i.value = value;
    let start = value;
    i.addEventListener('focus', () => {
      this.editing = true;
      start = i.value;
    });
    const done = () => {
      this.editing = false;
      if (i.value !== start) commit(i.value);
      this.dirty = true;
    };
    i.addEventListener('blur', done);
    i.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') i.blur();
      if (e.key === 'Escape') {
        i.value = start;
        i.blur();
      }
    });
  }
}

export class Output {
  constructor(body) {
    this.body = el('div', 'st-output', body);
    this.lines = 0;
  }

  print(text, kind = '') {
    const line = el('div', kind, this.body, text);
    if (++this.lines > 500) {
      this.body.firstChild.remove();
      this.lines--;
    }
    line.scrollIntoView({ block: 'nearest' });
  }
}

const BASIC = ['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'Seat', 'SpawnLocation', 'Model', 'Script', 'LocalScript', 'Tool', 'HopperBin', 'Decal', 'Texture',
  'SpecialMesh', 'BlockMesh', 'CylinderMesh', 'Sound', 'Fire', 'Smoke', 'Sparkles', 'PointLight', 'ClickDetector', 'Humanoid', 'Hint', 'Message', 'ScreenGui', 'Frame',
  'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'BillboardGui', 'StringValue', 'IntValue', 'NumberValue', 'BoolValue', 'ObjectValue', 'Vector3Value',
  'BrickColorValue', 'BodyGyro', 'BodyPosition', 'BodyVelocity', 'BodyForce', 'Weld', 'Team', 'Sky', 'Dialog', 'DialogChoice', 'Configuration'];

export function creatableClasses() {
  const all = [...CLASSES.keys()].filter((c) => isCreatable(c));
  const set = new Set(all);
  return [...BASIC.filter((c) => set.has(c)), ...all.filter((c) => !BASIC.includes(c)).sort()];
}

export class Objects {
  constructor(app, body) {
    this.app = app;
    const box = el('div', 'st-objects', body);
    const search = el('input', null, box);
    search.type = 'text';
    search.placeholder = 'Search objects';
    search.addEventListener('keydown', (e) => e.stopPropagation());
    const list = el('div', null, box);
    const draw = () => {
      list.replaceChildren();
      const q = search.value.trim().toLowerCase();
      for (const c of creatableClasses()) {
        if (q && !c.toLowerCase().includes(q)) continue;
        const row = el('div', 'st-obj', list);
        const ic = el('div', 'st-cicon', row);
        ic.style.cssText = classIconStyle(classIcon(c)) + ';width:16px;height:16px';
        el('span', null, row, c);
        row.addEventListener('click', () => this.app.insertObject(c));
      }
    };
    search.addEventListener('input', draw);
    draw();
  }
}

export function brickPicker(ui, current) {
  return ui.dialog('Select BrickColor', (body, finish) => {
    const pal = brickPalette();
    const ids = pal && pal.length ? pal : brickList();
    const grid = el('div', 'st-palette', body);
    let chosen = current;
    const name = el('div', null, body, brick(current).name);
    name.style.marginTop = '8px';
    for (const n of ids) {
      const b = brick(n);
      const c = el('div', n === current ? 'on' : '', grid);
      c.title = b.name;
      c.style.background = `rgb(${b.r * 255},${b.g * 255},${b.b * 255})`;
      c.addEventListener('click', () => {
        chosen = n;
        for (const x of grid.children) x.classList.remove('on');
        c.classList.add('on');
        name.textContent = b.name;
      });
      c.addEventListener('dblclick', () => finish(n));
    }
    return () => chosen;
  }, [['OK', true], ['Cancel', null]]);
}

const LUA_KW = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);

function highlight(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let out = '';
  const re = /(--\[(=*)\[[\s\S]*?\]\2\]|--[^\n]*)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|\[(=*)\[[\s\S]*?\]\4\])|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[0-9a-f]+\b)|([A-Za-z_]\w*)/gi;
  let last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += `<span class="com">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="str">${esc(m[3])}</span>`;
    else if (m[5]) out += `<span class="num">${esc(m[5])}</span>`;
    else if (m[6]) out += LUA_KW.has(m[6]) ? `<span class="kw">${m[6]}</span>` : esc(m[6]);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last)) + '\n';
}

export class ScriptEditor {
  constructor(parent, script, onChange) {
    this.script = script;
    this.el = el('div', 'st-editor', parent);
    this.gutter = el('div', 'st-gutter', this.el);
    const code = el('div', 'st-code', this.el);
    this.pre = el('pre', null, code);
    this.ta = el('textarea', null, code);
    this.ta.spellcheck = false;
    this.ta.autocapitalize = 'off';
    this.ta.autocomplete = 'off';
    this.ta.value = script.props.get('Source') || '';
    let timer = null;
    const sync = () => {
      this.pre.innerHTML = highlight(this.ta.value);
      const n = this.ta.value.split('\n').length;
      this.gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      this.ta.style.height = this.pre.scrollHeight + 'px';
      this.ta.style.width = this.pre.scrollWidth + 'px';
    };
    this.ta.addEventListener('input', () => {
      sync();
      clearTimeout(timer);
      timer = setTimeout(() => onChange(this.ta.value), 400);
    });
    this.ta.addEventListener('blur', () => {
      clearTimeout(timer);
      onChange(this.ta.value);
    });
    this.ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = this.ta.selectionStart, en = this.ta.selectionEnd;
        this.ta.setRangeText('\t', s, en, 'end');
        sync();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onChange(this.ta.value, true);
      }
    });
    code.addEventListener('scroll', () => (this.gutter.scrollTop = code.scrollTop));
    sync();
  }

  reload() {
    if (document.activeElement === this.ta) return;
    const v = this.script.props.get('Source') || '';
    if (v !== this.ta.value) {
      this.ta.value = v;
      this.ta.dispatchEvent(new Event('input'));
    }
  }

  show(on) {
    this.el.style.display = on ? '' : 'none';
  }

  dispose() {
    this.el.remove();
  }
}
