import { endpointUrl } from '../client/assets.js';
import { el, classIconStyle, setClassIcons } from './ui.js';
import { brick, brickPalette, brickList } from '../shared/brickcolor.js';
import { ENUMS, isCreatable, CLASSES, propEra, classEra } from '../shared/classes.js';

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

const VISIBLE_SERVICES = ['Workspace', 'Players', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService', 'Chat', 'LocalizationService', 'TestService', 'Debris'];

const CLASS_ICON_2018 = {
  ReplicatedFirst: 70, ReplicatedStorage: 70, ServerStorage: 69, ServerScriptService: 71, StarterPlayer: 79, StarterPlayerScripts: 78, StarterCharacterScripts: 78,
  Chat: 33, LocalizationService: 92, LocalizationTable: 92, TestService: 68, Teams: 23, ModuleScript: 76, Folder: 77,
  RemoteEvent: 75, RemoteFunction: 74, BindableEvent: 67, BindableFunction: 66, MeshPart: 73, UnionOperation: 73, NegateOperation: 72, PartOperation: 73,
  Terrain: 65, Accessory: 32, Attachment: 81, ParticleEmitter: 80, Trail: 93, Beam: 94, PointLight: 13, SpotLight: 13, SurfaceLight: 13,
  SoundGroup: 85, EchoSoundEffect: 84, ReverbSoundEffect: 84, ChorusSoundEffect: 84, CompressorSoundEffect: 84, DistortionSoundEffect: 84, EqualizerSoundEffect: 84, FlangeSoundEffect: 84, PitchShiftSoundEffect: 84, TremoloSoundEffect: 84,
  BlurEffect: 83, BloomEffect: 83, ColorCorrectionEffect: 83, SunRaysEffect: 83, SurfaceGui: 64, ScrollingFrame: 48, ViewportFrame: 48, TextBox: 51,
  UIListLayout: 26, UIGridLayout: 26, UITableLayout: 26, UIPageLayout: 26, UIPadding: 26, UIScale: 26, UISizeConstraint: 26, UITextSizeConstraint: 26, UIAspectRatioConstraint: 26,
  BallSocketConstraint: 86, HingeConstraint: 87, PrismaticConstraint: 88, CylindricalConstraint: 88, RopeConstraint: 89, RodConstraint: 90, SpringConstraint: 91, WeldConstraint: 95, NoCollisionConstraint: 95,
  AlignPosition: 95, AlignOrientation: 95, VectorForce: 94, LineForce: 94, Torque: 94, AngularVelocity: 94, BodyForce: 14,
  Animator: 60, AnimationController: 60, KeyframeSequence: 60, Keyframe: 60, Pose: 60, HumanoidDescription: 9, WrapTarget: 0,
  Players: 21, Workspace: 19, Lighting: 13, StarterGui: 46, StarterPack: 20, SoundService: 31, Debris: 30, InsertService: 72, CollectionService: 77, PhysicsService: 1,
  TweenService: 60, HttpService: 92, RunService: 67, MarketplaceService: 20, BadgeService: 68, DataStoreService: 69, TeleportService: 19, UserInputService: 5,
  ContextActionService: 5, PathfindingService: 9, TextService: 50, GroupService: 21, VRService: 5, HapticService: 5, GamePassService: 20, PointsService: 68,
  NetworkServer: 15, NetworkClient: 16, Camera: 5,
};
let iconEra = 2012;
export function setIconEra(era) {
  iconEra = era === 2018 ? 2018 : 2012;
}

export function classIcon(cls) {
  if (iconEra === 2018) return CLASS_ICON_2018[cls] ?? CLASS_ICON[cls] ?? 0;
  return CLASS_ICON[cls] ?? 0;
}
setClassIcons(classIcon);

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
    this.query = '';
    const bar = el('div', 'st-explorer-search', body);
    this.search = el('input', null, bar);
    this.search.type = 'search';
    this.search.placeholder = app.era === 2018 ? 'Filter workspace (Ctrl+Shift+X)' : 'Search (Ctrl+Shift+X)';
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.dirty = true;
      this.render();
    });
    this.search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.search.value = '';
        this.query = '';
        this.dirty = true;
        this.render();
        this.search.blur();
      } else if (e.key === 'Enter') {
        const first = this.tree.querySelector('.st-node.match');
        if (first) {
          this.app.select([first._inst]);
          this.app.activate(first._inst);
        }
      }
    });
    this.tree = el('div', 'st-tree', body);
    this.dirty = true;
    body.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  filtered() {
    const q = this.query;
    const shown = new Set(), hits = new Set();
    let seen = 0;
    const visit = (inst) => {
      if (++seen > 200000) return;
      const name = String(inst.props.get('Name') ?? '').toLowerCase();
      if (name.includes(q) || inst.ClassName.toLowerCase() === q) {
        hits.add(inst);
        for (let p = inst; p && p !== this.app.dm.root; p = p.parent) shown.add(p);
      }
      for (const c of inst.children) if (!c.studioHidden) visit(c);
    };
    for (const r of this.roots()) visit(r);
    return { shown, hits };
  }

  expandTo(inst) {
    for (let p = inst.parent; p && p !== this.app.dm.root; p = p.parent) this.open.add(p);
    this.dirty = true;
  }

  roots() {
    const dm = this.app.dm;
    const rank = (c) => {
      const i = VISIBLE_SERVICES.indexOf(c.ClassName);
      return i < 0 ? VISIBLE_SERVICES.length : i;
    };
    return dm.root.children.filter((c) => (VISIBLE_SERVICES.includes(c.ClassName) || c.studioHidden === false) && !c.studioHidden).sort((a, b) => rank(a) - rank(b) || a.ClassName.localeCompare(b.ClassName));
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const sel = this.app.selection;
    const frag = document.createDocumentFragment();
    let count = 0;
    const filter = this.query ? this.filtered() : null;
    const isOpen = (inst) => (filter ? filter.shown.has(inst) && inst.children.some((c) => filter.shown.has(c)) : this.open.has(inst));
    const row = (inst, depth) => {
      if (++count > 20000) return;
      const n = document.createElement('div');
      n.className = 'st-node' + (sel.has(inst) ? ' selected' : '') + (filter && filter.hits.has(inst) ? ' match' : '');
      n.style.paddingLeft = depth * 16 + 'px';
      const kids = inst.children.filter((c) => !c.studioHidden && (!filter || filter.shown.has(c)));
      const tw = el('div', 'st-twisty' + (kids.length ? ' has' : '') + (isOpen(inst) ? ' open' : ''), n);
      const ic = el('div', 'st-cicon', n);
      ic.style.cssText = classIconStyle(classIcon(inst.ClassName));
      el('span', 'st-label', n, inst.props.get('Name'));
      const add = el('div', 'st-add', n, '+');
      add.title = 'Insert object';
      add.addEventListener('pointerdown', (e) => e.stopPropagation());
      add.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.insertMenu(inst, add.getBoundingClientRect());
      });
      n._inst = inst;
      tw.addEventListener('click', (e) => {
        e.stopPropagation();
        if (filter) return;
        if (this.open.has(inst)) this.open.delete(inst);
        else this.open.add(inst);
        this.dirty = true;
        this.render();
      });
      frag.appendChild(n);
      if (isOpen(inst)) for (const c of kids) row(c, depth + 1);
    };
    for (const r of this.roots()) if (!filter || filter.shown.has(r)) row(r, 0);
    if (filter && !filter.hits.size) el('div', 'st-tree-empty', frag, 'No matches');
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
        this.app.ui.contextMenu(this.app.selectionMenu(inst), e.clientX, e.clientY);
        return;
      }
      press = { inst, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, dragging: false, long: null };
      if (e.pointerType === 'touch') {
        press.long = setTimeout(() => {
          if (!press) return;
          if (!this.app.selection.has(inst)) this.app.select([inst]);
          this.app.ui.contextMenu(this.app.selectionMenu(inst), press.x, press.y);
          press = null;
        }, 550);
      }
    });
    const scroller = () => {
      for (let el = this.tree; el && el !== document.body; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      }
      return null;
    };
    const markDrop = (x, y) => {
      for (const n of this.tree.querySelectorAll('.drop')) n.classList.remove('drop');
      const over = document.elementFromPoint(x, y)?.closest('.st-node');
      if (over && this.tree.contains(over)) over.classList.add('drop');
    };
    const autoScroll = () => {
      if (!press || !press.dragging) return;
      const sc = scroller();
      if (sc) {
        const r = sc.getBoundingClientRect();
        const edge = Math.min(32, r.height / 4);
        let dy = 0;
        if (press.cy > r.bottom - edge) dy = Math.min(24, (press.cy - (r.bottom - edge)) / 2 + 2);
        else if (press.cy < r.top + edge) dy = -Math.min(24, ((r.top + edge) - press.cy) / 2 + 2);
        if (dy) {
          sc.scrollTop += dy;
          markDrop(press.cx, Math.max(r.top + 2, Math.min(r.bottom - 2, press.cy)));
        }
      }
      press.raf = requestAnimationFrame(autoScroll);
    };
    this.tree.addEventListener('pointermove', (e) => {
      if (!press || press.id !== e.pointerId || e.pointerType === 'touch') return;
      press.cx = e.clientX;
      press.cy = e.clientY;
      if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        press.dragging = true;
        if (!this.app.selection.has(press.inst)) this.app.select([press.inst]);
        try { this.tree.setPointerCapture(e.pointerId); } catch {}
        press.raf = requestAnimationFrame(autoScroll);
      }
      if (press.dragging) markDrop(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.long);
      if (press.raf) cancelAnimationFrame(press.raf);
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
    const era = this.app.era === 2018 ? 2018 : 2012;
    const names = [...first.info.all.keys()].filter((n) => !HIDDEN.has(n) && sel.every((s) => s.info.all.has(n)) && first.info.all.get(n).type !== 'any' && (era === 2018 || propEra(first.ClassName, n) === 2012));
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
    const key = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : JSON.stringify(v));
    const same = (get) => sel.length < 2 || sel.every((s) => key(get(s)) === key(get(first)));
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

export function creatableClasses(era = 2018) {
  const all = [...CLASSES.keys()].filter((c) => isCreatable(c) && (era === 2018 || classEra(c) === 2012));
  const set = new Set(all);
  return [...BASIC.filter((c) => set.has(c)), ...all.filter((c) => !BASIC.includes(c)).sort()];
}

export class Toolbox {
  constructor(app, body) {
    this.app = app;
    const box = el('div', 'st-toolbox', body);
    const top = el('div', 'st-tb-top', box);
    this.set = el('select', null, top);
    const sets = [['free', 'Free Models'], ['mine', 'My Models'], ['plugins', 'Plugins'], ['basic', 'Basic Objects']];
    if (!endpointUrl('studioToolbox', app.cfg.placeId)) sets.splice(0, 3);
    for (const [v, t] of sets) {
      const o = el('option', null, this.set, t);
      o.value = v;
    }
    this.search = el('input', null, top);
    this.search.type = 'text';
    this.search.placeholder = 'Search';
    this.search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.load(true);
    });
    this.list = el('div', 'st-tb-list', box);
    this.more = el('button', 'st-tb-more', box, 'More');
    this.more.hidden = true;
    this.more.addEventListener('click', () => this.load(false));
    this.set.addEventListener('change', () => {
      this.search.value = '';
      this.load(true);
    });
    let t = null;
    this.search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => this.load(true), this.set.value === 'basic' ? 0 : 350);
    });
    this.page = 1;
    this.seq = 0;
    this.load(true);
  }

  async load(reset) {
    const set = this.set.value;
    const q = this.search.value.trim();
    if (reset) {
      this.page = 1;
      this.list.replaceChildren();
      this.list.className = 'st-tb-list' + (set === 'basic' ? ' basic' : '');
    }
    this.more.hidden = true;
    if (set === 'basic') return this.basic(q.toLowerCase());
    const seq = ++this.seq;
    const base = endpointUrl('studioToolbox', this.app.cfg.placeId);
    const url = `${base}${base.includes('?') ? '&' : '?'}set=${set}&page=${this.page}&q=${encodeURIComponent(q)}`;
    let data;
    try {
      const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      data = await r.json();
    } catch {
      data = null;
    }
    if (seq !== this.seq) return;
    if (!data || !data.success) {
      el('div', 'st-tb-empty', this.list, 'The toolbox could not be loaded.');
      return;
    }
    if (!data.items.length && this.page === 1) el('div', 'st-tb-empty', this.list, set === 'mine' ? 'You have no models yet.' : set === 'plugins' ? 'No plugins found.' : 'No models found.');
    for (const it of data.items) {
      const cell = el('div', 'st-tb-item', this.list);
      cell.title = `${it.name}\nby ${it.creator}`;
      const img = el('img', null, cell);
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      if (it.thumb) img.src = it.thumb;
      el('div', 'st-tb-name', cell, it.name);
      if (set === 'plugins') {
        cell.title += '\nClick to install';
        cell.addEventListener('click', () => this.app.installPlugin(it.id, it.name).catch((e) => this.app.print(String(e.message || e), 'err')));
        continue;
      }
      cell.addEventListener('click', () => this.app.insertAsset(it.id, it.name).catch((e) => this.app.print(String(e.message || e), 'err')));
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-studio-toolbox', JSON.stringify({ id: it.id, name: it.name }));
        e.dataTransfer.setData('text/plain', it.name);
      });
    }
    this.page++;
    this.more.hidden = !data.more;
  }

  basic(q) {
    for (const c of creatableClasses(this.app && this.app.era)) {
      if (q && !c.toLowerCase().includes(q)) continue;
      const row = el('div', 'st-obj', this.list);
      const ic = el('div', 'st-cicon', row);
      ic.style.cssText = classIconStyle(classIcon(c)) + ';width:16px;height:16px';
      el('span', null, row, c);
      row.addEventListener('click', () => this.app.insertObject(c));
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-studio-toolbox', JSON.stringify({ cls: c }));
        e.dataTransfer.setData('text/plain', c);
      });
    }
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

export { ScriptEditor } from './scripteditor.js';
