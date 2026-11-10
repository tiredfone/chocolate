import { CLASSES, ENUMS, isService } from '../shared/classes.js';
import { memberIndex } from '../shared/luahost.js';
import { BRICK } from '../shared/brickcolor.js';

export const KEYWORDS = ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'];

export const GLOBALS = {
  game: 'DataModel', Game: 'DataModel', workspace: 'Workspace', Workspace: 'Workspace', script: 'Script',
  print: 'function', warn: 'function', error: 'function', assert: 'function', wait: 'function', Wait: 'function', delay: 'function', Delay: 'function',
  spawn: 'function', Spawn: 'function', tick: 'function', time: 'function', elapsedTime: 'function', pcall: 'function', ypcall: 'function', xpcall: 'function',
  pairs: 'function', ipairs: 'function', next: 'function', select: 'function', type: 'function', tostring: 'function', tonumber: 'function', unpack: 'function',
  setmetatable: 'function', getmetatable: 'function', rawget: 'function', rawset: 'function', rawequal: 'function', require: 'function', loadstring: 'function',
  LoadLibrary: 'function', settings: 'function', UserSettings: 'function', version: 'function',
  _G: 'table', shared: 'table', math: 'library', string: 'library', table: 'library', coroutine: 'library', os: 'library',
  Instance: 'datatype', Vector3: 'datatype', Vector2: 'datatype', CFrame: 'datatype', Color3: 'datatype', BrickColor: 'datatype', UDim: 'datatype', UDim2: 'datatype', Ray: 'datatype', Region3: 'datatype', Enum: 'enums',
};

export const LIBS = {
  math: ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'cosh', 'deg', 'exp', 'floor', 'fmod', 'frexp', 'huge', 'ldexp', 'log', 'log10', 'max', 'min', 'modf', 'pi', 'pow', 'rad', 'random', 'randomseed', 'sin', 'sinh', 'sqrt', 'tan', 'tanh'],
  string: ['byte', 'char', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'rep', 'reverse', 'sub', 'upper'],
  table: ['concat', 'insert', 'maxn', 'remove', 'sort'],
  coroutine: ['create', 'resume', 'running', 'status', 'wrap', 'yield'],
  os: ['time', 'difftime', 'clock', 'date'],
  Instance: ['new'],
  Vector3: ['new', 'FromNormalId', 'FromAxis'],
  Vector2: ['new'],
  CFrame: ['new', 'Angles', 'fromEulerAnglesXYZ', 'fromAxisAngle'],
  Color3: ['new'],
  BrickColor: ['new', 'Random', 'palette', 'White', 'Gray', 'DarkGray', 'Black', 'Red', 'Yellow', 'Green', 'Blue'],
  UDim: ['new'],
  UDim2: ['new'],
  Ray: ['new'],
  Region3: ['new'],
};

export const DATATYPE_MEMBERS = {
  Vector3: { props: ['x', 'y', 'z', 'X', 'Y', 'Z', 'unit', 'magnitude'], methods: ['lerp', 'Lerp', 'Dot', 'Cross', 'isClose'] },
  CFrame: { props: ['p', 'x', 'y', 'z', 'X', 'Y', 'Z', 'lookVector'], methods: ['inverse', 'lerp', 'toWorldSpace', 'toObjectSpace', 'pointToWorldSpace', 'pointToObjectSpace', 'vectorToWorldSpace', 'vectorToObjectSpace', 'components', 'toEulerAnglesXYZ'] },
  Color3: { props: ['r', 'g', 'b'], methods: [] },
  BrickColor: { props: ['Name', 'Number', 'Color', 'r', 'g', 'b'], methods: [] },
  UDim2: { props: ['X', 'Y'], methods: [] },
  Ray: { props: ['Origin', 'Direction', 'Unit'], methods: ['ClosestPoint', 'Distance'] },
};

let index = null;
function idx() {
  if (!index) index = memberIndex();
  return index;
}

function preferCanonical(names) {
  const set = new Set(names);
  return [...set].filter((n) => !(/^[a-z]/.test(n) && set.has(n[0].toUpperCase() + n.slice(1)))).sort((a, b) => a.localeCompare(b));
}

const memberCache = new Map();
export function classMembers(cls) {
  if (memberCache.has(cls)) return memberCache.get(cls);
  const info = CLASSES.get(cls);
  if (!info) return null;
  const ix = idx();
  const props = [], methods = [], events = [];
  const seen = { p: new Set(), m: new Set(), e: new Set() };
  if (info.chain.includes('Instance')) {
    for (const [name, type] of [['Parent', 'Ref'], ['ClassName', 'string']]) {
      seen.p.add(name);
      props.push({ name, type, from: 'Instance' });
    }
  }
  for (const c of info.chain) {
    const ci = CLASSES.get(c);
    for (const [name, p] of ci.own) {
      if (seen.p.has(name)) continue;
      seen.p.add(name);
      props.push({ name, type: p.enumType ? `Enum.${p.enumType}` : p.type, def: p.def, from: c });
    }
    for (const name of ix.computed.get(c) || []) if (!seen.p.has(name)) { seen.p.add(name); props.push({ name, type: 'computed', from: c }); }
    for (const name of preferCanonical([...(ix.methods.get(c) || []), ...(ix.luaMethods[c] || [])])) if (!seen.m.has(name)) { seen.m.add(name); methods.push({ name, from: c }); }
    for (const name of ix.events.get(c) || []) if (!seen.e.has(name)) { seen.e.add(name); events.push({ name, from: c }); }
  }
  const out = { cls, chain: info.chain, props, methods, events, abstract: info.abstract, service: info.service, creatable: !info.abstract && !info.service && !info.nocreate };
  memberCache.set(cls, out);
  return out;
}

export function classTree() {
  const kids = new Map();
  for (const [name, c] of CLASSES) {
    const base = c.base || '';
    if (!kids.has(base)) kids.set(base, []);
    kids.get(base).push(name);
  }
  for (const list of kids.values()) list.sort((a, b) => a.localeCompare(b));
  return kids;
}

function serviceOf(dm, name) {
  return dm.services.get(name) || null;
}

function parseChain(expr) {
  const parts = [];
  const re = /^\s*([A-Za-z_]\w*)/;
  let m = re.exec(expr);
  if (!m) return null;
  parts.push({ name: m[1] });
  let rest = expr.slice(m[0].length);
  while (rest.length) {
    let mm;
    if ((mm = /^\s*([.:])\s*([A-Za-z_]\w*)\s*(\(\s*(?:"([^"]*)"|'([^']*)')?[^()]*\))?/.exec(rest))) {
      parts.push({ sep: mm[1], name: mm[2], call: !!mm[3], arg: mm[4] ?? mm[5] ?? null });
      rest = rest.slice(mm[0].length);
    } else if ((mm = /^\s*\[\s*(?:"([^"]*)"|'([^']*)')\s*\]/.exec(rest))) {
      parts.push({ sep: '.', name: mm[1] ?? mm[2] });
      rest = rest.slice(mm[0].length);
    } else return null;
  }
  return parts;
}

function localAlias(text, name, depth) {
  if (depth > 3) return null;
  const re = new RegExp(`local\\s+${name}\\s*=\\s*([^\\n;]+)`, 'g');
  let m, last = null;
  while ((m = re.exec(text))) last = m[1];
  return last ? last.trim() : null;
}

export function resolveExpr(expr, ctx, depth = 0) {
  const chain = parseChain(expr);
  if (!chain) return null;
  const { dm, script, text } = ctx;
  let cur = null;
  const head = chain[0].name;
  if (head === 'game' || head === 'Game') cur = { inst: dm.root, cls: 'DataModel' };
  else if (head === 'workspace' || head === 'Workspace') cur = { inst: serviceOf(dm, 'Workspace'), cls: 'Workspace' };
  else if (head === 'script') cur = { inst: script || null, cls: script ? script.ClassName : 'Script' };
  else if (head === 'Enum' && chain.length <= 2) return chain.length === 1 ? { enums: true } : ENUMS[chain[1].name] ? { enumType: chain[1].name } : null;
  else if (LIBS[head] && chain.length === 1) return { lib: head };
  else {
    const alias = localAlias(text || '', head, depth);
    if (!alias) return null;
    const ctor = /^Instance\.new\(\s*["'](\w+)["']/.exec(alias);
    if (ctor) cur = { inst: null, cls: ctor[1] };
    else {
      const dt = /^(Vector3|CFrame|Color3|BrickColor|UDim2|Ray)\.\w+/.exec(alias);
      if (dt) cur = { datatype: dt[1] };
      else cur = resolveExpr(alias, ctx, depth + 1);
    }
    if (!cur) return null;
  }
  for (let i = 1; i < chain.length; i++) {
    const seg = chain[i];
    if (!cur || cur.datatype || cur.lib || cur.enums || cur.enumType) return null;
    if (seg.sep === ':') {
      if (!seg.call) return null;
      const n = seg.name.toLowerCase();
      if ((n === 'getservice' || n === 'service' || n === 'findservice') && seg.arg) {
        const s = serviceOf(dm, seg.arg);
        cur = s ? { inst: s, cls: s.ClassName } : CLASSES.has(seg.arg) && isService(seg.arg) ? { inst: null, cls: seg.arg } : null;
      } else if ((n === 'findfirstchild' || n === 'waitforchild') && seg.arg) {
        const c = cur.inst && cur.inst.findChild(seg.arg);
        cur = c ? { inst: c, cls: c.ClassName } : null;
      } else if (n === 'clone') cur = { inst: cur.inst, cls: cur.cls };
      else return null;
      continue;
    }
    if (seg.call) return null;
    if (seg.name === 'Parent') {
      const p = cur.inst && cur.inst.parent;
      cur = p ? { inst: p, cls: p.ClassName } : null;
      continue;
    }
    const child = cur.inst && cur.inst.findChild(seg.name);
    if (child) {
      cur = { inst: child, cls: child.ClassName };
      continue;
    }
    const svc = cur.cls === 'DataModel' ? serviceOf(dm, seg.name) : null;
    if (svc) {
      cur = { inst: svc, cls: svc.ClassName };
      continue;
    }
    const info = CLASSES.get(cur.cls);
    const p = info && info.all.get(seg.name);
    if (p && p.type === 'Ref') {
      const v = cur.inst && cur.inst.props.get(seg.name);
      cur = v ? { inst: v, cls: v.ClassName } : null;
      continue;
    }
    if (p && ['V3', 'CF', 'C3', 'BC', 'UD2'].includes(p.type)) {
      cur = { datatype: { V3: 'Vector3', CF: 'CFrame', C3: 'Color3', BC: 'BrickColor', UD2: 'UDim2' }[p.type] };
      continue;
    }
    return null;
  }
  return cur;
}

function identifiersIn(text) {
  const out = new Set();
  const re = /\b(?:local\s+function|function|local)\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_]\w*)*)/g;
  let m;
  while ((m = re.exec(text))) for (const n of m[1].split(',')) out.add(n.trim());
  const re2 = /\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+(?:=|in)/g;
  while ((m = re2.exec(text))) for (const n of m[1].split(',')) out.add(n.trim());
  const re3 = /\bfunction\s*[\w.:]*\(([^)]*)\)/g;
  while ((m = re3.exec(text))) for (const n of m[1].split(',')) if (/^[A-Za-z_]\w*$/.test(n.trim())) out.add(n.trim());
  return out;
}

function inStringOrComment(before) {
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (/--/.test(line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ''))) return true;
  const stripped = line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  return /["']/.test(stripped);
}

function stringCompletions(before, ctx) {
  const m = /([A-Za-z_]\w*(?:\s*(?:[.:]\s*[A-Za-z_]\w*\s*(?:\((?:[^()]|\([^()]*\))*\))?|\[\s*(?:"[^"]*"|'[^']*')\s*\]))*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(\s*(["'])([^"'\n]*)$/.exec(before);
  if (!m) return null;
  const [, objExpr, sep, method, , partial] = m;
  const fn = method.toLowerCase();
  let names = null, kind = 'global', detail = '';
  if (objExpr === 'Instance' && sep === '.' && fn === 'new') {
    names = [...CLASSES.values()].filter((c) => !c.abstract && !c.service && !c.nocreate).map((c) => c.name);
    kind = 'class';
    detail = 'Instance';
  } else if (sep === ':' && (fn === 'getservice' || fn === 'service' || fn === 'findservice')) {
    names = [...CLASSES.values()].filter((c) => c.service).map((c) => c.name);
    kind = 'class';
    detail = 'Service';
  } else if (sep === ':' && (fn === 'isa' || fn === 'findfirstchildofclass' || fn === 'findfirstchildwhichisa' || fn === 'getchildrenofclass')) {
    names = [...CLASSES.keys()];
    kind = 'class';
    detail = 'Class';
  } else if (sep === ':' && (fn === 'findfirstchild' || fn === 'waitforchild' || fn === 'findfirstdescendant')) {
    const t = resolveExpr(objExpr, { ...ctx, text: before });
    if (t && t.inst) names = [...new Set(t.inst.children.map((c) => String(c.props.get('Name'))))];
    kind = 'child';
    detail = 'Child';
  } else if (objExpr === 'BrickColor' && sep === '.' && fn === 'new') {
    names = [...new Set([...BRICK.values()].map((b) => b.name))];
    kind = 'enumitem';
    detail = 'BrickColor';
  }
  if (!names) return null;
  const low = partial.toLowerCase();
  const items = names
    .filter((n) => n.toLowerCase().startsWith(low) && n !== partial)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => ({ label: n, kind, detail, insert: n }));
  return items.length ? { from: before.length - partial.length, to: before.length, word: partial, string: true, items: items.slice(0, 300) } : null;
}

export function completions(text, caret, ctx) {
  const before = text.slice(0, caret);
  const str = stringCompletions(before, ctx);
  if (str) return str;
  if (inStringOrComment(before)) return null;
  const word = /([A-Za-z_]\w*)?$/.exec(before)[1] || '';
  const start = caret - word.length;
  const lead = before.slice(0, start);
  const sepM = /([.:])\s*$/.exec(lead);
  const items = [];
  const add = (label, kind, detail, insert) => {
    if (word && !label.toLowerCase().startsWith(word.toLowerCase())) return;
    if (label === word) return;
    items.push({ label, kind, detail: detail || '', insert: insert || label });
  };
  if (sepM) {
    const sep = sepM[1];
    const baseText = lead.slice(0, lead.length - sepM[0].length);
    const exprM = /([A-Za-z_][\w]*(?:\s*(?:[.:]\s*[A-Za-z_]\w*\s*(?:\((?:[^()]|\([^()]*\))*\))?|\[\s*(?:"[^"]*"|'[^']*')\s*\]))*)\s*$/.exec(baseText);
    if (!exprM) return null;
    const target = resolveExpr(exprM[1], { ...ctx, text: before });
    if (!target) return null;
    if (target.lib) {
      if (sep === '.') for (const n of LIBS[target.lib]) add(n, target.lib === 'math' && (n === 'pi' || n === 'huge') ? 'property' : 'function', `${target.lib}.${n}`);
    } else if (target.enums) {
      if (sep === '.') for (const n of Object.keys(ENUMS).sort()) add(n, 'enum', 'Enum');
    } else if (target.enumType) {
      if (sep === '.') for (const n of Object.keys(ENUMS[target.enumType])) add(n, 'enumitem', `Enum.${target.enumType}`);
    } else if (target.datatype) {
      const d = DATATYPE_MEMBERS[target.datatype];
      if (d) {
        if (sep === '.') for (const n of d.props) add(n, 'property', target.datatype);
        else for (const n of d.methods) add(n, 'method', target.datatype, n + '(');
      }
    } else if (target.cls) {
      const mem = classMembers(target.cls);
      if (!mem) return null;
      if (sep === '.') {
        if (target.inst) for (const c of target.inst.children) {
          const n = c.props.get('Name');
          if (/^[A-Za-z_]\w*$/.test(n)) add(n, 'child', c.ClassName);
        }
        for (const p of mem.props) add(p.name, 'property', p.type);
        for (const e of mem.events) add(e.name, 'event', 'event');
      } else {
        for (const m of mem.methods) add(m.name, 'method', m.from, m.name + '(');
      }
    }
  } else {
    if (!word) return null;
    for (const k of KEYWORDS) add(k, 'keyword', 'keyword');
    for (const [g, t] of Object.entries(GLOBALS)) add(g, t === 'function' ? 'function' : 'global', t);
    for (const n of identifiersIn(text)) if (n !== word) add(n, 'local', 'local');
  }
  const seen = new Set();
  const uniq = items.filter((i) => (seen.has(i.label) ? false : seen.add(i.label)));
  const rank = { child: 0, property: 1, method: 1, event: 2, local: 0, keyword: 3, global: 2, function: 2, enum: 0, enumitem: 0 };
  uniq.sort((a, b) => {
    const pa = a.label.toLowerCase().startsWith(word.toLowerCase()) && a.label.startsWith(word) ? 0 : 1;
    const pb = b.label.toLowerCase().startsWith(word.toLowerCase()) && b.label.startsWith(word) ? 0 : 1;
    return pa - pb || (rank[a.kind] ?? 5) - (rank[b.kind] ?? 5) || a.label.localeCompare(b.label);
  });
  return uniq.length ? { from: start, to: caret, word, items: uniq.slice(0, 200) } : null;
}
