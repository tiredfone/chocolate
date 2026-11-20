import * as C from '../shared/cframe.js';
import { ENUMS, canonicalProp, isCreatable, isService, classInfo, enumName } from '../shared/classes.js';
import { BRICK, brick } from '../shared/brickcolor.js';
import { TOOLS } from './mcp-tools.js';

const SCRIPTS = ['Script', 'LocalScript', 'ModuleScript'];
const MAX_SOURCE = 400000;
const READONLY = new Set(['ClassName', 'DataModel']);

class McpError extends Error {}

const fail = (msg) => {
  throw new McpError(msg);
};

const cloneVal = (v) => (Array.isArray(v) ? v.slice() : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\./g, '\\.');
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const hex = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0');

function splitPath(s) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) cur += s[++i];
    else if (ch === '.') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function nums(v, n, what) {
  let a = v;
  if (typeof v === 'string') a = v.split(/[\s,{}]+/).filter(Boolean).map(Number);
  if (Array.isArray(a) && a.length >= n && a.slice(0, n).every((x) => Number.isFinite(num(x)))) return a.slice(0, n).map(num);
  return fail(`${what} needs ${n} numbers`);
}

export function createMcp(app) {
  const dm = app.dm;
  let chain = Promise.resolve();

  const pathOf = (inst) => {
    if (inst === dm.root) return 'game';
    const parts = [];
    for (let x = inst; x && x !== dm.root; x = x.parent) parts.unshift(esc(x.props.get('Name')));
    return parts.join('.');
  };

  const attached = (inst) => inst === dm.root || inst.isDescendantOf(dm.root);

  function resolve(ref, what = 'instance') {
    if (ref === undefined || ref === null || ref === '') return fail(`${what} is required`);
    if (typeof ref === 'number' || (typeof ref === 'string' && /^-?\d+$/.test(ref.trim()))) {
      const inst = dm.byId.get(Number(ref));
      if (!inst || inst.destroyed || !attached(inst)) return fail(`No instance with id ${ref} in the place`);
      return inst;
    }
    if (typeof ref !== 'string') return fail(`${what} must be a path string or an instance id`);
    const parts = splitPath(ref.trim());
    if (parts[0] === 'game' || parts[0] === 'DataModel') parts.shift();
    let cur = dm.root;
    let walked = 'game';
    for (const p of parts) {
      if (p === '') continue;
      const next = cur.children.find((c) => c.props.get('Name') === p);
      if (!next) {
        const names = cur.children.slice(0, 12).map((c) => c.props.get('Name'));
        return fail(`No child named "${p}" under ${walked}. Children: ${names.length ? names.join(', ') : '(none)'}${cur.children.length > 12 ? ', ...' : ''}`);
      }
      cur = next;
      walked = pathOf(cur);
    }
    return cur;
  }

  const brief = (i) => ({ id: i.id, name: i.props.get('Name'), class: i.ClassName, path: pathOf(i) });

  function serialize(info, v) {
    if (v === null || v === undefined) return null;
    switch (info.type) {
      case 'number': case 'int': case 'bool': case 'string': case 'Content': return v;
      case 'enum': return (info.enumType && enumName(info.enumType, v)) ?? v;
      case 'BC': return { number: v, name: brick(v).name };
      case 'C3': return Array.isArray(v) ? '#' + hex(v[0]) + hex(v[1]) + hex(v[2]) : null;
      case 'Ref': return v && v.props ? pathOf(v) : null;
      case 'V3': case 'V2': case 'CF': case 'UD2': case 'UD': return Array.isArray(v) ? v.slice() : null;
      default: return typeof v === 'object' ? undefined : v;
    }
  }

  function propsOf(inst) {
    const out = {};
    for (const [k, info] of inst.info.all) {
      if (k === 'Source') continue;
      const v = serialize(info, inst.props.get(k));
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function parseValue(inst, name, info, value) {
    const bad = (why) => fail(`Property ${name} (${info.type}) ${why}`);
    switch (info.type) {
      case 'number': {
        const n = num(value);
        return Number.isFinite(n) ? n : bad('needs a number');
      }
      case 'int': {
        const n = num(value);
        return Number.isFinite(n) ? Math.trunc(n) : bad('needs an integer');
      }
      case 'bool':
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 'false') return value === 'true';
        return bad('needs true or false');
      case 'string': case 'Content':
        return typeof value === 'string' || typeof value === 'number' ? String(value) : bad('needs a string');
      case 'enum': {
        const e = info.enumType && ENUMS[info.enumType];
        if (typeof value === 'string' && e) {
          const k = Object.keys(e).find((x) => x.toLowerCase() === value.toLowerCase());
          if (k !== undefined) return e[k];
          return bad(`must be one of ${Object.keys(e).join(', ')}`);
        }
        const n = num(value);
        if (!Number.isInteger(n)) return bad(e ? `must be one of ${Object.keys(e).join(', ')}` : 'needs an integer');
        if (e && !Object.values(e).includes(n)) return bad(`must be one of ${Object.keys(e).join(', ')}`);
        return n;
      }
      case 'BC': {
        if (typeof value === 'string' && !/^\d+$/.test(value)) {
          for (const b of BRICK.values()) if (b.name.toLowerCase() === value.toLowerCase()) return b.n;
          return bad('needs a BrickColor number or name');
        }
        const n = num(value);
        return BRICK.has(n) ? n : bad('is not a known BrickColor number');
      }
      case 'V3': {
        if (value && !Array.isArray(value) && typeof value === 'object') return nums([value.x, value.y, value.z], 3, name);
        return nums(value, 3, name);
      }
      case 'V2': {
        if (value && !Array.isArray(value) && typeof value === 'object') return nums([value.x, value.y], 2, name);
        return nums(value, 2, name);
      }
      case 'C3': {
        if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value.trim())) {
          const h = value.trim().replace('#', '');
          return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        }
        let a = value;
        if (value && !Array.isArray(value) && typeof value === 'object') a = [value.r, value.g, value.b];
        return nums(a, 3, name).map((x) => Math.max(0, Math.min(255, x)) / 255);
      }
      case 'CF': {
        if (Array.isArray(value) && value.length === 3) return C.withPos(inst.props.get(name), ...nums(value, 3, name));
        return nums(value, 12, name);
      }
      case 'UD2': {
        let a = value;
        if (value && !Array.isArray(value) && typeof value === 'object') a = [value.xScale, value.xOffset, value.yScale, value.yOffset];
        const n = nums(a, 4, name);
        return [n[0], Math.trunc(n[1]), n[2], Math.trunc(n[3])];
      }
      case 'UD': {
        const n = nums(value, 2, name);
        return [n[0], Math.trunc(n[1])];
      }
      case 'Ref':
        return value === null || value === '' ? null : resolve(value, name);
      default:
        return bad('cannot be set through MCP');
    }
  }

  function parseProps(inst, properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return fail('properties must be an object');
    const entries = [];
    let parent;
    for (const [key, value] of Object.entries(properties)) {
      if (key === 'Parent') {
        parent = value === null ? null : resolve(value, 'Parent');
        continue;
      }
      if (key === 'Position' && inst.isA('BasePart')) {
        entries.push(['CFrame', C.withPos(inst.props.get('CFrame'), ...nums(value && !Array.isArray(value) ? [value.x, value.y, value.z] : value, 3, 'Position'))]);
        continue;
      }
      if (READONLY.has(key)) return fail(`${key} is read-only`);
      const name = canonicalProp(inst.ClassName, key);
      const info = name && inst.info.all.get(name);
      if (!info) return fail(`${inst.ClassName} has no property "${key}"`);
      entries.push([name, parseValue(inst, name, info, value)]);
    }
    return { entries, parent };
  }

  function checkParent(inst, parent) {
    if (parent === inst || parent.isDescendantOf(inst)) return fail('An instance cannot be parented to itself or one of its descendants');
    if (isService(inst.ClassName) || inst === dm.root) return fail(`${inst.ClassName} cannot be moved`);
    if (parent.destroyed) return fail('The parent was destroyed');
  }

  function applyProps(inst, entries, parent, label) {
    const olds = entries.map(([n]) => [n, cloneVal(inst.props.get(n))]);
    const oldParent = inst.parent;
    const apply = (list, p) => {
      for (const [n, v] of list) app.setPropRaw(inst, n, v);
      if (p !== undefined && inst.parent !== p) app.reparentRaw(inst, p);
    };
    apply(entries, parent);
    app.record(label, () => apply(olds, parent === undefined ? undefined : oldParent), () => apply(entries, parent));
    app.selectionChanged();
  }

  function count(inst) {
    let n = 0;
    const walk = (x) => {
      n += x.children.length;
      for (const c of x.children) walk(c);
    };
    walk(inst);
    return n;
  }

  function scriptOf(ref) {
    const inst = resolve(ref);
    if (!SCRIPTS.includes(inst.ClassName)) return fail(`${pathOf(inst)} is a ${inst.ClassName}, not a script`);
    return inst;
  }

  function writeSource(script, src) {
    const old = script.props.get('Source');
    if (src === old) return false;
    const set = (v) => {
      app.setPropRaw(script, 'Source', v);
      const d = app.docs && app.docs.get('script:' + script.id);
      if (d && d.ed && d.ed.reload) d.ed.reload();
    };
    set(src);
    app.record('Edit Script', () => set(old), () => set(src));
    return true;
  }

  const handlers = {
    get_place_info() {
      const ws = dm.services.get('Workspace');
      const services = [...dm.services.values()].map((s) => s.ClassName);
      return {
        placeId: app.cfg.placeId,
        name: app.cfg.placeName || null,
        era: app.era,
        role: app.cfg.role || null,
        unsavedChanges: !!app.dirty,
        teamCreate: !!(app.team && app.team.open),
        services,
        workspaceDescendants: ws ? ws.descendants().length : 0,
        totalInstances: count(dm.root),
        selection: [...app.selection].map((i) => pathOf(i)),
        undoSteps: app.undoStack.length,
        redoSteps: app.redoStack.length,
        undoNext: app.undoStack.length ? app.undoStack[app.undoStack.length - 1].name : null,
        playing: !!app.playing,
      };
    },

    list_children(a) {
      const root = a.instance === undefined ? dm.root : resolve(a.instance);
      const depth = Math.min(6, Math.max(1, a.depth | 0 || 1));
      let budget = Math.min(1000, Math.max(1, a.limit | 0 || 300));
      let truncated = false;
      const walk = (inst, d) => {
        const out = [];
        for (const c of inst.children) {
          if (budget-- <= 0) {
            truncated = true;
            break;
          }
          const n = { ...brief(c), childCount: c.children.length };
          if (d < depth && c.children.length) n.children = walk(c, d + 1);
          out.push(n);
        }
        return out;
      };
      const children = walk(root, 1);
      return { parent: brief(root), children, truncated };
    },

    get_instance(a) {
      const inst = resolve(a.instance);
      const out = { ...brief(inst), parent: inst.parent ? pathOf(inst.parent) : null, properties: propsOf(inst), childCount: inst.children.length, descendantCount: count(inst) };
      out.children = inst.children.slice(0, 50).map((c) => ({ id: c.id, name: c.props.get('Name'), class: c.ClassName, childCount: c.children.length }));
      if (inst.children.length > 50) out.childrenTruncated = true;
      if (SCRIPTS.includes(inst.ClassName)) out.sourceLength = String(inst.props.get('Source') || '').length;
      return out;
    },

    search_instances(a) {
      const root = a.root === undefined ? dm.root : resolve(a.root, 'root');
      const limit = Math.min(500, Math.max(1, a.limit | 0 || 100));
      const q = typeof a.name === 'string' ? a.name.toLowerCase() : null;
      if (q === null && !a.class) return fail('Give a name, a class, or both');
      if (a.class && !classInfo(a.class)) return fail(`Unknown class "${a.class}"`);
      const found = [];
      let total = 0;
      for (const i of root.descendants()) {
        const nm = String(i.props.get('Name')).toLowerCase();
        if (q !== null && (a.exact ? nm !== q : !nm.includes(q))) continue;
        if (a.class && !i.isA(a.class)) continue;
        total++;
        if (found.length < limit) found.push(brief(i));
      }
      return { total, results: found, truncated: total > found.length };
    },

    create_instance(a) {
      const cls = typeof a.class === 'string' ? a.class : fail('class is required');
      if (!classInfo(cls)) return fail(`Unknown class "${cls}"`);
      if (!isCreatable(cls)) return fail(`${cls} cannot be created`);
      const parent = resolve(a.parent, 'parent');
      if (parent.destroyed) return fail('The parent was destroyed');
      const inst = dm.create(cls, null);
      try {
        inst.props.set('Name', typeof a.name === 'string' && a.name ? a.name : cls);
        app.touch(inst, 'Name');
        app.defaults(inst);
        const { entries, parent: extra } = a.properties === undefined ? { entries: [] } : parseProps(inst, a.properties);
        for (const [n, v] of entries) app.setPropRaw(inst, n, v);
        if (extra !== undefined && extra !== null) return fail('Pass the parent as the parent argument, not as a property');
      } catch (e) {
        dm.destroy(inst, true);
        throw e;
      }
      try {
        dm.setParent(inst, parent);
      } catch (e) {
        dm.destroy(inst, true);
        return fail(e.message);
      }
      app.add([inst], `Insert ${cls}`);
      return { created: brief(inst) };
    },

    set_properties(a) {
      const inst = resolve(a.instance);
      const { entries, parent } = parseProps(inst, a.properties);
      if (!entries.length && parent === undefined) return fail('properties is empty');
      if (parent) checkParent(inst, parent);
      if (parent === null) return fail('Use delete_instance to remove an instance');
      applyProps(inst, entries, parent, `Change ${entries.map(([n]) => n).concat(parent ? ['Parent'] : []).join(', ')}`);
      return { updated: brief(inst), properties: propsOf(inst) };
    },

    delete_instance(a) {
      const inst = resolve(a.instance);
      if (inst === dm.root || isService(inst.ClassName)) return fail(`${inst.ClassName} cannot be deleted`);
      const was = brief(inst);
      app.remove([inst]);
      if (inst.parent) return fail('The instance could not be deleted');
      return { deleted: was };
    },

    clone_instance(a) {
      const inst = resolve(a.instance);
      if (inst === dm.root || isService(inst.ClassName)) return fail(`${inst.ClassName} cannot be cloned`);
      const parent = a.parent === undefined ? inst.parent : resolve(a.parent, 'parent');
      if (!parent) return fail('The instance has no parent to clone into');
      const copy = app.freshClone(inst);
      if (!copy) return fail(`${pathOf(inst)} is not Archivable, so it cannot be cloned`);
      if (typeof a.name === 'string' && a.name) {
        copy.props.set('Name', a.name);
        app.touch(copy, 'Name');
      }
      try {
        dm.setParent(copy, parent);
      } catch (e) {
        dm.destroy(copy, true);
        return fail(e.message);
      }
      app.add([copy], 'Duplicate');
      return { cloned: brief(copy) };
    },

    reparent_instance(a) {
      const inst = resolve(a.instance);
      const parent = resolve(a.parent, 'parent');
      checkParent(inst, parent);
      if (inst.parent === parent) return { moved: brief(inst), unchanged: true };
      app.reparent([inst], parent);
      if (inst.parent !== parent) return fail('The instance could not be moved');
      return { moved: brief(inst) };
    },

    get_script_source(a) {
      const s = scriptOf(a.instance);
      const src = String(s.props.get('Source') || '');
      return { ...brief(s), length: src.length, source: src.slice(0, MAX_SOURCE), truncated: src.length > MAX_SOURCE };
    },

    set_script_source(a) {
      const s = scriptOf(a.instance);
      if (typeof a.source !== 'string') return fail('source must be a string');
      const changed = writeSource(s, a.source);
      return { ...brief(s), length: a.source.length, changed };
    },

    get_selection() {
      return { selection: [...app.selection].filter(attached).map(brief) };
    },

    set_selection(a) {
      if (!Array.isArray(a.instances)) return fail('instances must be an array');
      const list = a.instances.map((r) => resolve(r));
      app.select(list);
      return { selection: [...app.selection].map(brief) };
    },

    async run_code(a) {
      if (typeof a.code !== 'string' || !a.code.trim()) return fail('code must be a non-empty string');
      const wait = Math.min(10000, Math.max(300, a.wait_ms | 0 || 1200));
      const out = [];
      const o = app.output;
      const orig = o.print;
      o.print = function (text, kind) {
        out.push({ text: String(text), kind: kind || '' });
        return orig.call(o, text, kind);
      };
      try {
        await app.runCommand(a.code);
        await sleep(wait);
      } finally {
        o.print = orig;
      }
      const lines = out.filter((l, i) => !(i === 0 && l.text.startsWith('> ')));
      return { output: lines.map((l) => (l.kind === 'err' ? 'Error: ' + l.text : l.text)).join('\n'), errors: lines.filter((l) => l.kind === 'err').length, lines: lines.length };
    },

    undo() {
      const step = app.undoStack[app.undoStack.length - 1];
      if (!step) return fail('Nothing to undo');
      app.undo();
      return { undone: step.name, undoSteps: app.undoStack.length, redoSteps: app.redoStack.length };
    },

    redo() {
      const step = app.redoStack[app.redoStack.length - 1];
      if (!step) return fail('Nothing to redo');
      app.redo();
      return { redone: step.name, undoSteps: app.undoStack.length, redoSteps: app.redoStack.length };
    },
  };

  const known = new Set(TOOLS.map((t) => t.name));

  function call(name, args) {
    const run = async () => {
      if (!known.has(name) || !handlers[name]) return { ok: false, error: `Unknown tool "${name}"` };
      const a = args === undefined || args === null ? {} : args;
      if (Array.isArray(a) && a.length === 0) a = {};
      if (typeof a !== 'object' || Array.isArray(a)) return { ok: false, error: 'Arguments must be an object' };
      try {
        return { ok: true, result: await handlers[name](a) };
      } catch (e) {
        if (e instanceof McpError) return { ok: false, error: e.message };
        return { ok: false, error: `${name} failed: ${e && e.message ? e.message : e}` };
      }
    };
    const p = chain.then(run, run);
    chain = p.then(() => {}, () => {});
    return p;
  }

  return { tools: TOOLS, call, resolve, pathOf };
}

export { TOOLS };
