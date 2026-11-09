import { isService } from './classes.js';

const HEADER = '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n\t<External>null</External>\n\t<External>nil</External>\n';
const SKIP = new Set(['Archivable', 'RobloxLocked', 'DistributedGameTime', 'LocalPlayer', 'NumPlayers', 'JobId', 'PlaceId', 'CreatorId', 'GameId', 'Parent', 'ClassName']);
const SERIAL = {
  BasePart: { Size: 'size', Color: 'Color3uint8' },
  Part: { Shape: 'shape', FormFactor: 'formFactorRaw' },
  WedgePart: { FormFactor: 'formFactorRaw' },
  TrussPart: { FormFactor: 'formFactorRaw' },
  Seat: { Shape: 'shape', FormFactor: 'formFactorRaw' },
  SpawnLocation: { Shape: 'shape', FormFactor: 'formFactorRaw' },
  Camera: { CFrame: 'CoordinateFrame' },
  Humanoid: { Health: 'Health_XML', MaxHealth: 'MaxHealth' },
  Fire: { Size: 'size_xml', Heat: 'heat_xml' },
  Smoke: { Size: 'size_xml', Opacity: 'opacity_xml', RiseVelocity: 'riseVelocity_xml' },
};
const KEEP_SERVICES = new Set(['Workspace', 'Lighting', 'StarterGui', 'StarterPack']);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function f(v) {
  if (v === Infinity) return 'INF';
  if (v === -Infinity) return '-INF';
  if (!Number.isFinite(v)) return 'NAN';
  return String(Number(Number(v).toPrecision(9)));
}

function color32(c) {
  const b = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return String(((255 << 24) | (b(c[0]) << 16) | (b(c[1]) << 8) | b(c[2])) >>> 0);
}

function serialName(inst, name) {
  for (const base of [inst.ClassName, 'Part', 'BasePart']) {
    const m = SERIAL[base];
    if (m && m[name] && (base === inst.ClassName || inst.isA(base))) return m[name];
  }
  return name;
}

function value(type, tag, name, v, refOf) {
  const n = esc(name);
  switch (type) {
    case 'bool': return `<bool name="${n}">${v ? 'true' : 'false'}</bool>`;
    case 'int': return `<${tag === 'int64' ? 'int64' : 'int'} name="${n}">${Math.trunc(v) || 0}</${tag === 'int64' ? 'int64' : 'int'}>`;
    case 'number': return `<${tag === 'double' ? 'double' : 'float'} name="${n}">${f(v)}</${tag === 'double' ? 'double' : 'float'}>`;
    case 'string': {
      const t = tag === 'ProtectedString' ? 'ProtectedString' : 'string';
      return `<${t} name="${n}">${esc(v ?? '')}</${t}>`;
    }
    case 'Content': return v ? `<Content name="${n}"><url>${esc(v)}</url></Content>` : `<Content name="${n}"><null></null></Content>`;
    case 'enum': return `<token name="${n}">${Math.trunc(v) || 0}</token>`;
    case 'BC': return `<int name="${n}">${Math.trunc(v) || 0}</int>`;
    case 'C3':
      return `<Color3 name="${n}">${color32(v)}</Color3>`;
    case 'V3': return `<Vector3 name="${n}"><X>${f(v[0])}</X><Y>${f(v[1])}</Y><Z>${f(v[2])}</Z></Vector3>`;
    case 'V2': return `<Vector2 name="${n}"><X>${f(v[0])}</X><Y>${f(v[1])}</Y></Vector2>`;
    case 'CF': {
      const k = ['X', 'Y', 'Z', 'R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'];
      return `<CoordinateFrame name="${n}">${k.map((x, i) => `<${x}>${f(v[i])}</${x}>`).join('')}</CoordinateFrame>`;
    }
    case 'UD2': return `<UDim2 name="${n}"><XS>${f(v[0])}</XS><XO>${Math.trunc(v[1])}</XO><YS>${f(v[2])}</YS><YO>${Math.trunc(v[3])}</YO></UDim2>`;
    case 'UD': return `<UDim name="${n}"><S>${f(v[0])}</S><O>${Math.trunc(v[1])}</O></UDim>`;
    case 'Ref': return `<Ref name="${n}">${refOf(v)}</Ref>`;
    default: return null;
  }
}

export function writePlace(dm) {
  const tops = dm.root.children.filter((c) => c.fileProps || KEEP_SERVICES.has(c.ClassName) || (isService(c.ClassName) && c.children.some((k) => !k.fileProps)));
  return serialize(dm, tops);
}

export function writeModel(dm, list) {
  return serialize(dm, list);
}

function serialize(dm, tops) {
  const used = new Set();
  const refs = new Map();
  const walkRefs = (inst) => {
    if (inst.fileRef) used.add(inst.fileRef);
    for (const c of inst.children) walkRefs(c);
  };
  walkRefs(dm.root);
  let next = 0;
  const refFor = (inst) => {
    let r = refs.get(inst);
    if (r) return r;
    if (inst.fileRef && !refs.has(inst)) r = inst.fileRef;
    else {
      do r = 'RBX' + (next++).toString(16).toUpperCase(); while (used.has(r));
      used.add(r);
    }
    refs.set(inst, r);
    return r;
  };
  const saved = new Set();
  const mark = (inst) => {
    if (inst.props.get('Archivable') === false) return;
    saved.add(inst);
    for (const c of inst.children) mark(c);
  };
  for (const t of tops) mark(t);
  const byFileRef = new Map();
  for (const i of saved) if (i.fileRef) byFileRef.set(i.fileRef, i);
  const refOf = (v) => (v && saved.has(v) ? refFor(v) : 'null');
  const out = [HEADER];
  const write = (inst, depth) => {
    const pad = '\t'.repeat(depth);
    out.push(`${pad}<Item class="${esc(inst.ClassName)}" referent="${refFor(inst)}">\n${pad}\t<Properties>\n`);
    const fp = inst.fileProps;
    const dirty = inst.dirtyProps;
    for (const [name, p] of inst.info.all) {
      const from = fp && fp.get(name);
      if ((SKIP.has(name) && !(from && name === 'Archivable')) || p.type === 'any') continue;
      const v = inst.props.get(name);
      const always = name === 'Name' || (inst.isA('BasePart') && (name === 'CFrame' || name === 'Size' || name === 'BrickColor'));
      if (fp && !from && !(dirty && dirty.has(name)) && !always) continue;
      const xml = value(p.type, from && from.tag, from ? from.raw : serialName(inst, name), v, refOf);
      if (xml) out.push(`${pad}\t\t${xml}\n`);
    }
    if (inst.extra) {
      for (const [name, pv] of inst.extra) {
        let xml;
        if (pv.t === 'raw') xml = pv.v;
        else if (pv.t === 'Ref') {
          const target = pv.v ? byFileRef.get(pv.v) : null;
          xml = `<Ref name="${esc(name)}">${target ? refFor(target) : 'null'}</Ref>`;
        } else xml = value(pv.t === 'number' ? 'number' : pv.t, pv.tag, name, pv.v, refOf);
        if (xml) out.push(`${pad}\t\t${xml}\n`);
      }
    }
    out.push(`${pad}\t</Properties>\n`);
    for (const c of inst.children) if (saved.has(c)) write(c, depth + 1);
    out.push(`${pad}</Item>\n`);
  };
  for (const t of tops) write(t, 1);
  out.push('</roblox>');
  return out.join('');
}
