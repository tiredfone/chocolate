import { Instance } from './instance.js';

const R = (v) => Math.round(v * 10000) / 10000;

export function encodeValue(type, v) {
  switch (type) {
    case 'Ref': return v instanceof Instance && !v.destroyed ? v.id : null;
    case 'V3': case 'V2': case 'C3': case 'UD2': case 'CF': return v.map(R);
    case 'number': return Number.isFinite(v) ? v : 0;
    case 'any': return undefined;
    default: return v;
  }
}

function isDefault(p, v) {
  const d = p.def;
  if (Array.isArray(d)) {
    if (!Array.isArray(v) || v.length !== d.length) return false;
    for (let i = 0; i < d.length; i++) if (d[i] !== v[i]) return false;
    return true;
  }
  return d === v || (p.type === 'Ref' && v == null);
}

export function hiddenProp(inst, name, forOwner) {
  if (name === 'Archivable') return true;
  if (name === 'Source' && inst.ClassName === 'Script') return true;
  if (name === 'Source' && inst.ClassName === 'ModuleScript') return !(inst.dm && inst.dm.era === 2018);
  return false;
}

export function encodeInst(inst) {
  const props = [];
  for (const [k, v] of inst.props) {
    const p = inst.info.all.get(k);
    if (!p || p.type === 'any') continue;
    if (k !== 'Name' && isDefault(p, v)) continue;
    if (hiddenProp(inst, k)) continue;
    props.push(k, encodeValue(p.type, v));
  }
  return [inst.id, inst.ClassName, inst.parent ? inst.parent.id : null, props];
}

export function encodeTree(root, filter) {
  const out = [];
  const walk = (x) => {
    if (filter && !filter(x)) return;
    out.push(encodeInst(x));
    for (const c of x.children) walk(c);
  };
  walk(root);
  return out;
}

export function decodeValue(dm, type, v) {
  if (type === 'Ref') return v == null ? null : dm.byId.get(v) || null;
  return v;
}

export function applyRecords(dm, records) {
  const refs = [];
  const fresh = [];
  for (const [id, cls, parentId, props] of records) {
    let inst = dm.byId.get(id);
    const existing = !!inst;
    if (!inst) {
      inst = dm.create(cls, null, id);
      inst.pendingParent = parentId;
      fresh.push(inst);
    }
    for (let i = 0; i < props.length; i += 2) {
      const k = props[i];
      const p = inst.info.all.get(k);
      if (!p) continue;
      if (p.type === 'Ref') refs.push([inst, k, props[i + 1], existing]);
      else if (existing) dm.setProp(inst, k, props[i + 1], { remote: true });
      else inst.props.set(k, props[i + 1]);
    }
  }
  for (const [inst, k, v, existing] of refs) {
    const val = decodeValue(dm, 'Ref', v);
    if (existing) dm.setProp(inst, k, val, { remote: true });
    else inst.props.set(k, val);
  }
  for (const inst of fresh) for (const o of dm.observers) if (o.created) o.created(inst);
  const freshSet = new Set(fresh);
  for (const inst of fresh) {
    const pid = inst.pendingParent;
    delete inst.pendingParent;
    const par = pid == null ? null : pid === 0 ? dm.root : dm.byId.get(pid);
    if (!par) continue;
    if (par === dm.root && inst.info.service) {
      dm.services.set(inst.ClassName, inst);
    }
    inst.parent = par;
    par.children.push(inst);
  }
  for (const inst of fresh) {
    if (inst.parent && !freshSet.has(inst.parent)) {
      for (const o of dm.observers) if (o.reparented) o.reparented(inst, null, { remote: true });
      dm.emit(inst.parent, 'ChildAdded', inst);
      for (let a = inst.parent; a; a = a.parent) dm.emit(a, 'DescendantAdded', inst);
    }
  }
  for (const inst of fresh) if (inst.info.service && inst.parent === dm.root) inst.parentLocked = true;
  return fresh;
}
