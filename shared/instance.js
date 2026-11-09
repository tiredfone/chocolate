import { classInfo, canonicalProp, isA, isService, CLASSES } from './classes.js';
import { nearestBrick } from './brickcolor.js';

const GENERIC = CLASSES.get('Instance');

function cloneValue(v) {
  return Array.isArray(v) ? v.slice() : v;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

export class Instance {
  constructor(dm, cls, id) {
    this.dm = dm;
    this.id = id;
    this.ClassName = cls;
    this.info = classInfo(cls) || GENERIC;
    this.props = new Map();
    this.extra = null;
    this.parent = null;
    this.children = [];
    this.destroyed = false;
    this.parentLocked = false;
    this.listeners = null;
    this.data = null;
    for (const [k, p] of this.info.all) this.props.set(k, cloneValue(p.def));
    this.props.set('Name', cls);
  }

  get Name() {
    return this.props.get('Name');
  }

  isA(base) {
    return this.info === GENERIC ? base === 'Instance' || base === this.ClassName : isA(this.ClassName, base);
  }

  get(name) {
    return this.props.get(name);
  }

  set(name, value, opts) {
    return this.dm.setProp(this, name, value, opts);
  }

  findChild(name, recursive = false) {
    for (const c of this.children) if (c.props.get('Name') === name) return c;
    if (recursive) {
      for (const c of this.children) {
        const r = c.findChild(name, true);
        if (r) return r;
      }
    }
    return null;
  }

  findChildOfClass(cls) {
    for (const c of this.children) if (c.ClassName === cls) return c;
    return null;
  }

  findChildWhichIsA(cls) {
    for (const c of this.children) if (c.isA(cls)) return c;
    return null;
  }

  isDescendantOf(other) {
    for (let p = this.parent; p; p = p.parent) if (p === other) return true;
    return false;
  }

  ancestorOfClass(cls) {
    for (let p = this.parent; p; p = p.parent) if (p.isA(cls)) return p;
    return null;
  }

  descendants(out = []) {
    for (const c of this.children) {
      out.push(c);
      c.descendants(out);
    }
    return out;
  }

  fullName() {
    const parts = [];
    for (let x = this; x && x !== this.dm.root; x = x.parent) parts.unshift(x.props.get('Name'));
    return parts.join('.');
  }

  on(event, fn) {
    if (!this.listeners) this.listeners = new Map();
    let s = this.listeners.get(event);
    if (!s) this.listeners.set(event, (s = new Set()));
    s.add(fn);
    return () => s.delete(fn);
  }
}

export class DataModel {
  constructor(side) {
    this.side = side;
    this.byId = new Map();
    this.nextId = side === 'server' ? 1 : -1;
    this.observers = [];
    this.luaSubs = new Set();
    this.luaSink = null;
    this.services = new Map();
    this.root = this.create('DataModel', null, 0);
    this.root.parentLocked = true;
  }

  allocId() {
    const id = this.nextId;
    this.nextId += this.side === 'server' ? 1 : -1;
    return id;
  }

  create(cls, parent = null, id = null) {
    const inst = new Instance(this, cls, id ?? this.allocId());
    this.byId.set(inst.id, inst);
    if (parent) this.setParent(inst, parent);
    return inst;
  }

  service(name) {
    let s = this.services.get(name);
    if (s) return s;
    if (!isService(name)) return null;
    s = this.create(name, null);
    s.parentLocked = false;
    this.setParent(s, this.root);
    s.parentLocked = true;
    this.services.set(name, s);
    return s;
  }

  observe(o) {
    this.observers.push(o);
    return () => {
      const i = this.observers.indexOf(o);
      if (i >= 0) this.observers.splice(i, 1);
    };
  }

  emit(inst, event, ...args) {
    const s = inst.listeners && inst.listeners.get(event);
    if (s) for (const fn of [...s]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(e);
      }
    }
    if (this.luaSink && this.luaSubs.has(inst.id + ':' + event)) this.luaSink(inst, event, args);
  }

  hasListener(inst, event) {
    return (inst.listeners && inst.listeners.get(event)?.size > 0) || this.luaSubs.has(inst.id + ':' + event);
  }

  coerce(inst, name, value) {
    const p = inst.info.all.get(name);
    if (!p) return value;
    switch (p.type) {
      case 'number': return Number.isFinite(+value) ? +value : 0;
      case 'int': return Number.isFinite(+value) ? Math.trunc(+value) : 0;
      case 'enum': case 'BC': return value | 0;
      case 'bool': return !!value;
      case 'string': case 'Content': return value == null ? '' : String(value);
      case 'Ref': return value instanceof Instance ? value : null;
      default: return value;
    }
  }

  setProp(inst, name, value, opts = null) {
    if (name === 'Parent') return this.setParent(inst, value);
    value = this.coerce(inst, name, value);
    const old = inst.props.get(name);
    if (sameValue(old, value) && !(opts && opts.force)) return false;
    inst.props.set(name, value);
    for (const o of this.observers) if (o.changed) o.changed(inst, name, old, opts);
    if (inst.listeners || this.luaSink) {
      if (inst.isA('ValueBase') && name === 'Value') this.emit(inst, 'Changed', value);
      else this.emit(inst, 'Changed', name);
    }
    return true;
  }

  setParent(inst, parent, opts = null) {
    if (inst.parent === parent) return false;
    if (inst.parentLocked || inst.destroyed) throw new Error(`The Parent property of ${inst.props.get('Name')} is locked`);
    if (parent) {
      if (parent === inst || parent.isDescendantOf(inst)) throw new Error('Attempt to set parent to a descendant or self');
      if (parent.destroyed) throw new Error('Attempt to parent to a destroyed instance');
    }
    const old = inst.parent;
    if (old) {
      const i = old.children.indexOf(inst);
      if (i >= 0) old.children.splice(i, 1);
    }
    inst.parent = parent || null;
    if (parent) parent.children.push(inst);
    for (const o of this.observers) if (o.reparented) o.reparented(inst, old, opts);
    if (old) {
      this.emit(old, 'ChildRemoved', inst);
      for (let a = old; a; a = a.parent) this.emit(a, 'DescendantRemoving', inst);
    }
    if (parent) {
      this.emit(parent, 'ChildAdded', inst);
      for (let a = parent; a; a = a.parent) this.emit(a, 'DescendantAdded', inst);
    }
    this.emitAncestry(inst, inst, parent);
    if (inst.listeners || this.luaSink) this.emit(inst, 'Changed', 'Parent');
    return true;
  }

  emitAncestry(inst, changed, parent) {
    this.emit(inst, 'AncestryChanged', changed, parent);
    for (const c of inst.children) this.emitAncestry(c, changed, parent);
  }

  destroy(inst) {
    if (inst.destroyed || inst === this.root || isService(inst.ClassName)) return;
    for (const c of [...inst.children]) this.destroy(c);
    if (inst.parent) {
      inst.parentLocked = false;
      this.setParent(inst, null);
    }
    inst.destroyed = true;
    inst.parentLocked = true;
    for (const o of this.observers) if (o.destroyed) o.destroyed(inst);
    inst.listeners = null;
    this.byId.delete(inst.id);
  }

  remove(inst) {
    if (inst === this.root || isService(inst.ClassName)) return;
    if (inst.parent) this.setParent(inst, null);
  }

  clone(inst) {
    if (!inst.props.get('Archivable')) return null;
    const map = new Map();
    const copy = (src) => {
      const c = this.create(src.ClassName, null);
      for (const [k, v] of src.props) c.props.set(k, cloneValue(v));
      if (src.extra) c.extra = new Map(src.extra);
      map.set(src, c);
      for (const ch of src.children) {
        if (!ch.props.get('Archivable')) continue;
        const cc = copy(ch);
        cc.parent = c;
        c.children.push(cc);
      }
      return c;
    };
    const top = copy(inst);
    for (const [src, c] of map) {
      for (const [k, v] of c.props) {
        if (v instanceof Instance && map.has(v)) c.props.set(k, map.get(v));
      }
    }
    for (const c of map.values()) for (const o of this.observers) if (o.created) o.created(c);
    return top;
  }

  load(nodes, parent, opts = {}) {
    const byRef = new Map();
    const pending = [];
    const made = [];
    const build = (node, par) => {
      let inst;
      if (par === this.root && isService(node.cls)) {
        inst = this.service(node.cls);
      } else {
        inst = this.create(node.cls, null);
        inst.parent = par;
        if (par) par.children.push(inst);
        made.push(inst);
      }
      if (node.ref) byRef.set(node.ref, inst);
      if (opts.track) {
        inst.fileRef = node.ref;
        inst.fileProps = new Map();
      }
      const hasBrick = node.props.has('BrickColor');
      for (const [rawName, pv] of node.props) {
        if (rawName === 'Parent' || rawName === 'ClassName') continue;
        if (pv.t === 'raw') {
          if (!inst.extra) inst.extra = new Map();
          inst.extra.set(rawName, pv);
          continue;
        }
        let name = canonicalProp(inst.ClassName, rawName);
        if (opts.track && name && inst.info.all.has(name)) inst.fileProps.set(name, { raw: rawName, tag: pv.tag });
        if ((rawName === 'Color3uint8' || rawName === 'Color') && !hasBrick && inst.info.all.has('BrickColor') && pv.t === 'C3') {
          inst.props.set('BrickColor', nearestBrick(pv.v[0], pv.v[1], pv.v[2]));
          continue;
        }
        if (!name || !inst.info.all.has(name)) {
          if (!inst.extra) inst.extra = new Map();
          inst.extra.set(rawName, pv);
          continue;
        }
        const pinfo = inst.info.all.get(name);
        if (pinfo.type === 'Ref') {
          if (pv.v) pending.push([inst, name, pv.v]);
          continue;
        }
        let v = pv.v;
        if (pinfo.type === 'BC' && pv.t === 'C3') v = nearestBrick(v[0], v[1], v[2]);
        else if (pinfo.type === 'C3' && pv.t !== 'C3') continue;
        else if (pinfo.type === 'V3' && pv.t !== 'V3') continue;
        else if (pinfo.type === 'CF' && pv.t !== 'CF') continue;
        inst.props.set(name, this.coerce(inst, name, cloneValue(v)));
      }
      if (inst.ClassName === 'Script' && opts.stripServerSource) inst.props.set('Source', '');
      for (const c of node.children) build(c, inst);
      return inst;
    };
    const tops = nodes.map((n) => build(n, parent));
    for (const [inst, name, ref] of pending) {
      const target = byRef.get(ref);
      if (target) inst.props.set(name, target);
    }
    const madeSet = new Set(made);
    for (const inst of made) for (const o of this.observers) if (o.created) o.created(inst);
    for (const inst of made) {
      if (inst.parent && !madeSet.has(inst.parent)) {
        for (const o of this.observers) if (o.reparented) o.reparented(inst, null, null);
        this.emit(inst.parent, 'ChildAdded', inst);
        for (let a = inst.parent; a; a = a.parent) this.emit(a, 'DescendantAdded', inst);
      }
    }
    return tops;
  }

  attach(inst, parent) {
    this.setParent(inst, parent);
  }

  inWorkspace(inst) {
    const ws = this.services.get('Workspace');
    return !!ws && inst.isDescendantOf(ws);
  }
}
