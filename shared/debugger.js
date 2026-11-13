const NO_BEFORE = new Set(['and', 'or', 'not', 'in', 'then', 'do']);
const CONT_END = /(?:[-+*/^%=<>~,(\[{]|\.\.|\band|\bor|\bnot|\blocal|\bfunction|\breturn)\s*$/;
const BLOCK_END = /^(end|else|elseif|until)\b/;

function scanLine(line, st) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (st.long) {
      const close = ']' + '='.repeat(st.long.eq) + ']';
      const j = line.indexOf(close, i);
      if (j < 0) return out;
      i = j + close.length;
      st.long = null;
      continue;
    }
    const c = line[i];
    if (st.str) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === st.str) st.str = null;
      i++;
      continue;
    }
    if (c === '-' && line[i + 1] === '-') {
      const m = /^\[(=*)\[/.exec(line.slice(i + 2));
      if (m) {
        st.long = { eq: m[1].length };
        i += 2 + m[0].length;
        continue;
      }
      return out;
    }
    if (c === '[') {
      const m = /^\[(=*)\[/.exec(line.slice(i));
      if (m) {
        st.long = { eq: m[1].length };
        out += 'S';
        i += m[0].length;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      st.str = c;
      out += 'S';
      i++;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') st.depth++;
    if (c === ')' || c === '}' || c === ']') st.depth = Math.max(0, st.depth - 1);
    out += c;
    i++;
  }
  if (st.str) st.str = null;
  return out;
}

export function instrument(source, sid) {
  const lines = String(source).split('\n');
  const st = { long: null, str: null, depth: 0 };
  let prevCode = '';
  let prevStart = '';
  const out = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const startLong = !!st.long, startDepth = st.depth;
    const code = scanLine(line, st).trim();
    let ok = !startLong && startDepth === 0 && code.length > 0;
    if (ok && /^[(\[]/.test(code)) ok = false;
    if (ok && prevCode && CONT_END.test(prevCode)) ok = false;
    if (ok && BLOCK_END.test(code) && /^(return|break)\b/.test(prevStart)) ok = false;
    if (ok && /^(return|break)\b/.test(prevStart) && !BLOCK_END.test(code)) ok = false;
    const first = (code.match(/^[A-Za-z_]+/) || [''])[0];
    if (ok && NO_BEFORE.has(first)) ok = false;
    if (ok && /^(?:[.:+\-*/^%=<>~,#]|\.\.)/.test(code) && !/^--/.test(code)) ok = false;
    out.push(ok ? `__dbg(${JSON.stringify(sid)},${n + 1}) ${line}` : line);
    if (code) {
      const continuation = startLong || startDepth > 0 || (prevCode && CONT_END.test(prevCode)) || NO_BEFORE.has(first) || /^(?:[.:+\-*/^%=<>~,#(\[]|\.\.)/.test(code);
      if (!continuation) prevStart = code;
      prevCode = code;
    }
  }
  return out.join('\n');
}

export function instrumentChecked(source, sid, compile) {
  let lines = instrument(source, sid).split('\n');
  const prefix = `__dbg(${JSON.stringify(sid)},`;
  for (let tries = 0; tries < 200; tries++) {
    const err = compile(lines.join('\n'));
    if (!err) return lines.join('\n');
    const m = /:(\d+):.*near '__dbg'/.exec(String(err));
    if (!m) return null;
    const n = +m[1] - 1;
    if (!lines[n] || !lines[n].startsWith(prefix)) return null;
    lines[n] = lines[n].replace(/^__dbg\([^)]*\) /, '');
  }
  return null;
}

export const DEBUG_LUA = `
local R = ...
local base, sandbox = R.base, R.sandbox
local D = { bps = {}, mode = "run", depth = 0, watches = {}, waiting = nil }
local dlib = rawget(_G, "__RTDEBUG") or {}
local getinfo, getlocal = dlib.getinfo, dlib.getlocal
if not getinfo then
  getinfo = function() return nil end
  getlocal = function() return nil end
end
local function depthOf()
  local d = 0
  while getinfo(d + 3, "l") do d = d + 1 end
  return d
end
local function show(v)
  local t = type(v)
  if t == "string" then return string.format("%q", #v > 200 and v:sub(1, 200) .. "..." or v) end
  local ok, s = pcall(tostring, v)
  return ok and s or ("<" .. t .. ">")
end
local function collect(level)
  local locals, names = {}, {}
  local i = 1
  while true do
    local k, v = getlocal(level, i)
    if not k then break end
    if k:sub(1, 1) ~= "(" then
      names[k] = v
      locals[#locals + 1] = { k, show(v), typeof and typeof(v) or type(v) }
    end
    i = i + 1
  end
  return locals, names
end
local function stack(level)
  local out = {}
  local l = level
  while #out < 30 do
    local info = getinfo(l, "Sln")
    if not info then break end
    if info.what ~= "C" then out[#out + 1] = { info.short_src or "?", info.currentline or 0, info.name or "" } end
    l = l + 1
  end
  return out
end
local function evalWatches(names, env)
  local out = {}
  for i, expr in ipairs(D.watches) do
    local f, err = loadstring("return " .. expr, "=watch")
    local val
    if f then
      setfenv(f, setmetatable({}, { __index = function(_, k) local v = names[k] if v ~= nil then return v end return env[k] end }))
      local ok, r = pcall(f)
      val = ok and show(r) or ("error: " .. tostring(r))
    else
      val = "error: " .. tostring(err)
    end
    out[i] = { expr, val }
  end
  return out
end
local function enc(v)
  local t = type(v)
  if t == "table" then
    local parts, isArr = {}, #v > 0 or next(v) == nil
    if isArr then
      for i = 1, #v do parts[#parts + 1] = enc(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = string.format("%q", tostring(k)) .. ":" .. enc(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "number" then return tostring(v)
  elseif t == "boolean" then return tostring(v)
  else return (string.format("%q", tostring(v)):gsub("\\\\\\n", "\\\\n")) end
end
local function dbg(sid, line)
  local b = D.bps[sid]
  local hit = b and b[line]
  local d
  if not hit and D.mode ~= "run" then
    d = depthOf()
    if D.mode == "into" then hit = true
    elseif D.mode == "over" then hit = d <= D.depth
    elseif D.mode == "out" then hit = d < D.depth end
  end
  if not hit then return end
  d = d or depthOf()
  local locals, names = collect(3)
  local env = getfenv(2)
  local info = { sid = sid, line = line, locals = locals, stack = stack(3), watches = evalWatches(names, env) }
  local send = rawget(_G, "__DBGSEND")
  if send then send(enc(info)) end
  local ev = sandbox.Instance.new("BindableEvent")
  D.waiting = ev
  D.depth = d
  D.mode = "run"
  ev.Event:Wait()
end
base.__dbg = dbg
sandbox.__dbg = dbg
rawset(_G, "__DBGCMD", function(cmd, a, b)
  if cmd == "bps" then
    local t = {}
    for sid, list in string.gmatch(a or "", "([^;]+)=([^;]*)") do
      local s = {}
      for n in string.gmatch(list, "%d+") do s[tonumber(n)] = true end
      t[sid] = s
    end
    D.bps = t
  elseif cmd == "watches" then
    local w = {}
    for e in string.gmatch(a or "", "([^\\n]+)") do w[#w + 1] = e end
    D.watches = w
  elseif cmd == "pause" then
    D.mode = "into"
  else
    D.mode = cmd == "continue" and "run" or cmd
    local ev = D.waiting
    D.waiting = nil
    if ev then ev:Fire() end
  end
end)
`;

export class DebugAgent {
  constructor(host, send) {
    this.host = host;
    this.send = send;
    host.lua.global.set('__DBGSEND', (json) => {
      try {
        this.send(JSON.parse(json));
      } catch {
        this.send({ error: 'bad pause data' });
      }
    });
  }

  command(cmd, a = '', b = '') {
    const f = this.host.lua.global.get('__DBGCMD');
    if (typeof f === 'function') f(String(cmd), String(a), String(b));
  }

  handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.cmd === 'bps') this.command('bps', Object.entries(msg.bps || {}).map(([sid, list]) => `${sid}=${(list || []).join(',')}`).join(';'));
    else if (msg.cmd === 'watches') this.command('watches', (msg.watches || []).map((w) => String(w).replace(/\n/g, ' ')).join('\n'));
    else if (['continue', 'into', 'over', 'out', 'pause'].includes(msg.cmd)) this.command(msg.cmd);
  }
}
