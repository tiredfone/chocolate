local R = ...
local base, sandbox, LM, ext = R.base, R.sandbox, R.LuaMethods, R.ext
LM.__rtEnvs[getfenv(1)] = true
local call, callAsync, wrap, idOf, isInstance = R.call, R.callAsync, R.wrap, R.idOf, R.isInstance
local makeSignal, newLocalSignal, fireLocal, subKey = R.makeSignal, R.newLocalSignal, R.fireLocal, R.subKey
local newThread, resume, sched_wait, scriptOf, ypcall = R.newThread, R.resume, R.sched_wait, R.scriptOf, R.ypcall
local Vector3, Vector2, Color3, UDim, UDim2, CFrame, Enum = R.Vector3, R.Vector2, R.Color3, R.UDim, R.UDim2, R.CFrame, R.Enum
local Region3 = R.Region3
local co_running = R.co_running
local fnum = R.fnum
local floor, abs, sqrt, sin, cos, pi, huge, min, max = math.floor, math.abs, math.sqrt, math.sin, math.cos, math.pi, math.huge, math.min, math.max
local fmt, byte, char, sub, gsub = string.format, string.byte, string.char, string.sub, string.gsub
local tinsert, tremove, sort, concat = table.insert, table.remove, table.sort, table.concat

local E = {}

local function export(k, v)
  base[k] = v
  sandbox[k] = v
end

local function mt(name, index)
  local m = { __type = name }
  m.__index = function(v, k)
    local f = index and index(v, k)
    if f ~= nil then return f end
    error(tostring(k) .. " is not a valid member of " .. name, 2)
  end
  return m
end

local NRMT = mt("NumberRange")
NRMT.__tostring = function(r) return fnum(r.Min) .. " " .. fnum(r.Max) end
NRMT.__eq = function(a, b) return a.Min == b.Min and a.Max == b.Max end
local function nrnew(a, b)
  a = tonumber(a) or 0
  b = tonumber(b) or a
  if b < a then error("NumberRange: invalid range", 3) end
  return setmetatable({ Min = a, Max = b }, NRMT)
end
export("NumberRange", { new = nrnew })

local NKMT = mt("NumberSequenceKeypoint")
NKMT.__tostring = function(k) return fnum(k.Time) .. " " .. fnum(k.Value) .. " " .. fnum(k.Envelope) end
NKMT.__eq = function(a, b) return a.Time == b.Time and a.Value == b.Value and a.Envelope == b.Envelope end
local function nknew(t, v, e) return setmetatable({ Time = tonumber(t) or 0, Value = tonumber(v) or 0, Envelope = tonumber(e) or 0 }, NKMT) end
export("NumberSequenceKeypoint", { new = nknew })

local NSMT = mt("NumberSequence")
NSMT.__tostring = function(s)
  local t = {}
  for i, k in ipairs(s.Keypoints) do t[i] = tostring(k) end
  return concat(t, " ")
end
local function nsfrom(points)
  local copy = {}
  for i, k in ipairs(points) do copy[i] = k end
  return setmetatable({ Keypoints = copy }, NSMT)
end
local function nsnew(a, b)
  if type(a) == "table" and getmetatable(a) == nil then
    if #a < 2 then error("NumberSequence: requires at least 2 keypoints", 2) end
    return nsfrom(a)
  end
  a = tonumber(a) or 0
  b = tonumber(b) or a
  return nsfrom({ nknew(0, a), nknew(1, b) })
end
export("NumberSequence", { new = nsnew })

local CKMT = mt("ColorSequenceKeypoint")
CKMT.__tostring = function(k) return fnum(k.Time) .. " " .. tostring(k.Value) end
local function cknew(t, c) return setmetatable({ Time = tonumber(t) or 0, Value = c or Color3.new() }, CKMT) end
export("ColorSequenceKeypoint", { new = cknew })

local CSMT = mt("ColorSequence")
CSMT.__tostring = function(s)
  local t = {}
  for i, k in ipairs(s.Keypoints) do t[i] = tostring(k) end
  return concat(t, " ")
end
local function csfrom(points)
  local copy = {}
  for i, k in ipairs(points) do copy[i] = k end
  return setmetatable({ Keypoints = copy }, CSMT)
end
local function csnew(a, b)
  if type(a) == "table" and getmetatable(a) == nil then
    if #a < 2 then error("ColorSequence: requires at least 2 keypoints", 2) end
    return csfrom(a)
  end
  return csfrom({ cknew(0, a or Color3.new()), cknew(1, b or a or Color3.new()) })
end
export("ColorSequence", { new = csnew })

local RectMT = mt("Rect", function(r, k)
  if k == "Width" then return r.Max.X - r.Min.X elseif k == "Height" then return r.Max.Y - r.Min.Y end
end)
RectMT.__tostring = function(r) return tostring(r.Min) .. ", " .. tostring(r.Max) end
RectMT.__eq = function(a, b) return a.Min == b.Min and a.Max == b.Max end
local function rectnew(a, b, c, d)
  if type(a) == "table" then return setmetatable({ Min = a, Max = b or Vector2.new() }, RectMT) end
  return setmetatable({ Min = Vector2.new(tonumber(a) or 0, tonumber(b) or 0), Max = Vector2.new(tonumber(c) or 0, tonumber(d) or 0) }, RectMT)
end
export("Rect", { new = rectnew })

local TIMT = mt("TweenInfo")
TIMT.__tostring = function(t) return "Time:" .. fnum(t.Time) .. " DelayTime:" .. fnum(t.DelayTime) .. " RepeatCount:" .. fnum(t.RepeatCount) .. " Reverses:" .. tostring(t.Reverses) .. " EasingDirection:" .. t.EasingDirection.Name .. " EasingStyle:" .. t.EasingStyle.Name end
local function enumArg(v, enum, default)
  if v == nil then return default end
  if type(v) == "string" then return enum[v] end
  if type(v) == "number" then return enum:FromValue(v) or default end
  return v
end
local function tinew(time, style, dir, rep, rev, delay)
  return setmetatable({
    Time = tonumber(time) or 1,
    EasingStyle = enumArg(style, Enum.EasingStyle, Enum.EasingStyle.Quad),
    EasingDirection = enumArg(dir, Enum.EasingDirection, Enum.EasingDirection.Out),
    RepeatCount = tonumber(rep) or 0,
    Reverses = rev and true or false,
    DelayTime = tonumber(delay) or 0,
  }, TIMT)
end
export("TweenInfo", { new = tinew })

local PPMT = mt("PhysicalProperties")
local MATERIAL_PHYS = { Plastic = { 0.7, 0.3, 0.5, 1, 1 } }
local function ppnew(a, b, c, d, e)
  if R.isEnumItem(a) then
    local m = MATERIAL_PHYS[a.Name] or MATERIAL_PHYS.Plastic
    a, b, c, d, e = m[1], m[2], m[3], m[4], m[5]
  end
  return setmetatable({ Density = tonumber(a) or 0.7, Friction = tonumber(b) or 0.3, Elasticity = tonumber(c) or 0.5, FrictionWeight = tonumber(d) or 1, ElasticityWeight = tonumber(e) or 1 }, PPMT)
end
export("PhysicalProperties", { new = ppnew })

local FacesMT = mt("Faces")
export("Faces", { new = function(...)
  local f = { Top = false, Bottom = false, Left = false, Right = false, Back = false, Front = false }
  for i = 1, select("#", ...) do
    local v = select(i, ...)
    if R.isEnumItem(v) then f[v.Name] = true end
  end
  return setmetatable(f, FacesMT)
end })
local AxesMT = mt("Axes")
export("Axes", { new = function(...)
  local a = { X = false, Y = false, Z = false }
  for i = 1, select("#", ...) do
    local v = select(i, ...)
    if R.isEnumItem(v) then
      local n = v.Name
      if n == "X" or n == "Right" or n == "Left" then a.X = true elseif n == "Y" or n == "Top" or n == "Bottom" then a.Y = true else a.Z = true end
    end
  end
  return setmetatable(a, AxesMT)
end })

local function round(n) return n >= 0 and floor(n + 0.5) or -floor(-n + 0.5) end
export("Vector3int16", { new = function(x, y, z) return Vector3.new(round(tonumber(x) or 0), round(tonumber(y) or 0), round(tonumber(z) or 0)) end })
export("Vector2int16", { new = function(x, y) return Vector2.new(round(tonumber(x) or 0), round(tonumber(y) or 0)) end })
export("Region3int16", { new = function(a, b) return Region3.new(a, b) end })

local RandomMT = { __type = "Random" }
RandomMT.__index = {
  NextNumber = function(self, lo, hi)
    self.s = (self.s * 1103515245 + 12345) % 2147483648
    local r = self.s / 2147483648
    lo, hi = tonumber(lo) or 0, tonumber(hi) or 1
    return lo + (hi - lo) * r
  end,
  NextInteger = function(self, lo, hi)
    self.s = (self.s * 1103515245 + 12345) % 2147483648
    lo, hi = floor(tonumber(lo) or 0), floor(tonumber(hi) or 0)
    return lo + floor(self.s / 2147483648 * (hi - lo + 1))
  end,
  Clone = function(self) return setmetatable({ s = self.s }, RandomMT) end,
}
export("Random", { new = function(seed) return setmetatable({ s = floor(tonumber(seed) or (R.J.now("tick") * 1000)) % 2147483648 }, RandomMT) end })

Color3.fromHSV = function(h, s, v)
  h, s, v = (tonumber(h) or 0) % 1, tonumber(s) or 0, tonumber(v) or 0
  local i = floor(h * 6)
  local f = h * 6 - i
  local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
  i = i % 6
  if i == 0 then return Color3.new(v, t, p) elseif i == 1 then return Color3.new(q, v, p) elseif i == 2 then return Color3.new(p, v, t)
  elseif i == 3 then return Color3.new(p, q, v) elseif i == 4 then return Color3.new(t, p, v) end
  return Color3.new(v, p, q)
end
Color3.toHSV = function(c)
  local r, g, b = c.r, c.g, c.b
  local mx, mn = max(r, g, b), min(r, g, b)
  local d = mx - mn
  local h = 0
  if d > 0 then
    if mx == r then h = ((g - b) / d) % 6 elseif mx == g then h = (b - r) / d + 2 else h = (r - g) / d + 4 end
    h = h / 6
  end
  return h, mx == 0 and 0 or d / mx, mx
end

local mathx = {}
for k, v in pairs(math) do mathx[k] = v end
mathx.clamp = function(x, a, b)
  if a > b then error("bad argument #3 to 'clamp' (max must be greater than or equal to min)", 2) end
  return x < a and a or (x > b and b or x)
end
mathx.sign = function(x) return x > 0 and 1 or (x < 0 and -1 or 0) end
mathx.noise = function(x, y, z)
  local n = sin((tonumber(x) or 0) * 12.9898 + (tonumber(y) or 0) * 78.233 + (tonumber(z) or 0) * 37.719) * 43758.5453
  return (n - floor(n)) - 0.5
end
export("math", mathx)

local utf8x = {}
utf8x.charpattern = "[%z\1-\127\194-\244][\128-\191]*"
utf8x.char = function(...)
  local out = {}
  for i = 1, select("#", ...) do
    local c = floor(tonumber((select(i, ...))) or 0)
    if c < 128 then out[#out + 1] = char(c)
    elseif c < 2048 then out[#out + 1] = char(192 + floor(c / 64), 128 + c % 64)
    elseif c < 65536 then out[#out + 1] = char(224 + floor(c / 4096), 128 + floor(c / 64) % 64, 128 + c % 64)
    else out[#out + 1] = char(240 + floor(c / 262144), 128 + floor(c / 4096) % 64, 128 + floor(c / 64) % 64, 128 + c % 64) end
  end
  return concat(out)
end
utf8x.len = function(s)
  local n = 0
  for _ in string.gmatch(s, utf8x.charpattern) do n = n + 1 end
  return n
end
utf8x.codes = function(s)
  local i = 1
  return function()
    if i > #s then return nil end
    local start = i
    local c = byte(s, i)
    local len = c < 128 and 1 or (c < 224 and 2 or (c < 240 and 3 or 4))
    i = i + len
    return start, utf8x.codepoint(s, start)
  end
end
utf8x.codepoint = function(s, i)
  i = i or 1
  local c = byte(s, i)
  if not c then return nil end
  if c < 128 then return c end
  if c < 224 then return (c - 192) * 64 + (byte(s, i + 1) - 128) end
  if c < 240 then return (c - 224) * 4096 + (byte(s, i + 1) - 128) * 64 + (byte(s, i + 2) - 128) end
  return (c - 240) * 262144 + (byte(s, i + 1) - 128) * 4096 + (byte(s, i + 2) - 128) * 64 + (byte(s, i + 3) - 128)
end
utf8x.offset = function(s, n, i)
  i = i or 1
  local count = 0
  for p in utf8x.codes(s) do
    if p >= i then
      count = count + 1
      if count == n then return p end
    end
  end
  return nil
end
export("utf8", utf8x)
export("debug", { profilebegin = function() end, profileend = function() end, traceback = function(m) return tostring(m or "") end })

local TYPES = {}
local function typeName(v)
  local t = type(v)
  if t == "userdata" then
    if isInstance(v) then return "Instance" end
    local inner = R.Signal.__box[v]
    if inner then return getmetatable(inner) == R.Signal and "RBXScriptSignal" or "RBXScriptConnection" end
    return "userdata"
  end
  if t ~= "table" then return t end
  local m = getmetatable(v)
  if m == nil then return "table" end
  if TYPES[m] then return TYPES[m] end
  if type(m) == "table" and rawget(m, "__type") then return m.__type end
  return "table"
end
TYPES[R.V3MT] = "Vector3"; TYPES[R.V2MT] = "Vector2"; TYPES[R.CFMT] = "CFrame"; TYPES[R.C3MT] = "Color3"
TYPES[R.BCMT] = "BrickColor"; TYPES[R.UD2MT] = "UDim2"; TYPES[R.UDMT] = "UDim"; TYPES[R.RayMT] = "Ray"
TYPES[R.R3MT] = "Region3"; TYPES[R.EnumItemMT] = "EnumItem"; TYPES[R.Signal] = "RBXScriptSignal"
export("typeof", typeName)
local baseLoadstring = base.loadstring
export("loadstring", function(src, name)
  if R.SIDE == "client" then error("loadstring() is not available", 2) end
  local sss = call(0, "FindService", "ServerScriptService")
  if not (sss and sss.LoadStringEnabled) then error("loadstring() is not available", 2) end
  local f, err = baseLoadstring(src, name)
  if f then setfenv(f, getfenv(2)) end
  return f, err
end)
export("version", function() return "0.338.0.202976" end)
export("stats", function() return call(0, "GetService", "Stats") end)
export("elapsedTime", function() return R.now() end)

ext.enc[NRMT] = function(out, v) out[#out + 1] = "nr"; out[#out + 1] = v.Min; out[#out + 1] = v.Max end
ext.enc[RectMT] = function(out, v) out[#out + 1] = "rect"; out[#out + 1] = v.Min.X; out[#out + 1] = v.Min.Y; out[#out + 1] = v.Max.X; out[#out + 1] = v.Max.Y end
ext.enc[NSMT] = function(out, v)
  out[#out + 1] = "ns"; out[#out + 1] = #v.Keypoints
  for _, k in ipairs(v.Keypoints) do out[#out + 1] = k.Time; out[#out + 1] = k.Value; out[#out + 1] = k.Envelope end
end
ext.enc[CSMT] = function(out, v)
  out[#out + 1] = "cs"; out[#out + 1] = #v.Keypoints
  for _, k in ipairs(v.Keypoints) do out[#out + 1] = k.Time; out[#out + 1] = k.Value.r; out[#out + 1] = k.Value.g; out[#out + 1] = k.Value.b end
end
ext.enc[TIMT] = function(out, v)
  out[#out + 1] = "ti"; out[#out + 1] = v.Time; out[#out + 1] = v.EasingStyle.Value; out[#out + 1] = v.EasingDirection.Value
  out[#out + 1] = v.RepeatCount; out[#out + 1] = v.Reverses; out[#out + 1] = v.DelayTime
end
ext.dec.nr = function(a, i) return nrnew(a[i + 1], a[i + 2]), i + 3 end
ext.dec.rect = function(a, i) return rectnew(a[i + 1], a[i + 2], a[i + 3], a[i + 4]), i + 5 end
ext.dec.ns = function(a, i)
  local n = a[i + 1]
  local pts = {}
  i = i + 2
  for k = 1, n do pts[k] = nknew(a[i], a[i + 1], a[i + 2]); i = i + 3 end
  return nsfrom(pts), i
end
ext.dec.cs = function(a, i)
  local n = a[i + 1]
  local pts = {}
  i = i + 2
  for k = 1, n do pts[k] = cknew(a[i], Color3.new(a[i + 1], a[i + 2], a[i + 3])); i = i + 4 end
  return csfrom(pts), i
end
ext.dec.ti = function(a, i) return tinew(a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5], a[i + 6]), i + 7 end
ext.dict = function(out, v, encInto)
  local keys = {}
  for k in pairs(v) do
    if type(k) == "string" or type(k) == "number" then keys[#keys + 1] = k end
  end
  out[#out + 1] = "d"; out[#out + 1] = #keys
  for _, k in ipairs(keys) do
    out[#out + 1] = type(k) == "number" and ("#" .. fnum(k)) or k
    encInto(out, v[k])
  end
end

local loading = {}
local assetModules = {}
R.setRunModule(function(m)
  if type(m) == "string" and tonumber(m) then m = tonumber(m) end
  if type(m) == "number" then
    local aid = floor(m)
    if aid <= 0 then error("Attempted to call require with invalid argument(s).", 2) end
    local mod = assetModules[aid]
    if not mod then
      local ins = call(0, "GetService", "InsertService")
      local model = callAsync(idOf[ins], "LoadAsset", aid)
      mod = model and model:FindFirstChild("MainModule")
      if not mod or not mod:IsA("ModuleScript") then
        error("Unable to find module MainModule in asset " .. aid, 2)
      end
      assetModules[aid] = mod
    end
    m = mod
  end
  if not isInstance(m) then error("Attempted to call require with invalid argument(s).", 2) end
  local id = idOf[m]
  local cached = R.moduleCache[id]
  if cached then return cached.value end
  if loading[id] then
    while loading[id] do sched_wait(0.03) end
    cached = R.moduleCache[id]
    if cached then return cached.value end
    error("Requested module experienced an error while loading", 2)
  end
  loading[id] = true
  local src = call(id, "__source")
  local name = call(id, "GetFullName")
  local f, err = R.compileFor(m, src or "", name)
  if not f then
    loading[id] = nil
    error(err or "Requested module experienced an error while loading", 2)
  end
  local res = { ypcall(f) }
  loading[id] = nil
  if not res[1] then error(tostring(res[2]), 2) end
  if res[2] == nil or #res > 2 then error("Module code did not return exactly one value", 2) end
  R.moduleCache[id] = { value = res[2] }
  return res[2]
end)

local propSignals = setmetatable({}, { __mode = "v" })
LM.GetPropertyChangedSignal = function(self, id, prop)
  prop = tostring(prop)
  local ok = call(id, "__hasProperty", prop)
  if not ok then error(prop .. " is not a valid property name.", 2) end
  return makeSignal(id, "P:" .. prop)
end

local function remoteCall(id, op, ...)
  return call(id, "__remote", op, ...)
end
LM.FireServer = function(self, id, ...) remoteCall(id, "fs", ...) end
LM.FireClient = function(self, id, player, ...)
  if not isInstance(player) then error("FireClient: player argument must be a Player object", 2) end
  remoteCall(id, "fc", player, ...)
end
LM.FireAllClients = function(self, id, ...) remoteCall(id, "fa", ...) end
LM.InvokeServer = function(self, id, ...)
  local res = { callAsync(id, "__invokeServer", ...) }
  if res[1] == false then error(tostring(res[2]), 2) end
  return unpack(res, 2, table.maxn(res))
end
LM.InvokeClient = function(self, id, player, ...)
  local res = { callAsync(id, "__invokeClient", player, ...) }
  if res[1] == false then error(tostring(res[2]), 2) end
  return unpack(res, 2, table.maxn(res))
end

local invokeHooked = {}
local function hookInvoke(id)
  if invokeHooked[id] then return end
  invokeHooked[id] = true
  makeSignal(id, "__Invoke"):connect(function(token, ...)
    local f = R.invokeHandlers[id]
    local deadline = R.now() + 30
    while not f and R.now() < deadline do
      sched_wait(0.03)
      f = R.invokeHandlers[id]
    end
    local res
    if f then res = { ypcall(f, ...) } else res = { false, "no handler" } end
    call(id, "__invokeResult", token, unpack(res, 1, table.maxn(res)))
  end)
end
local origNewindex = R.InstanceMT.__newindex
R.InstanceMT.__newindex = function(u, k, v)
  if type(v) == "function" and (k == "OnServerInvoke" or k == "OnClientInvoke") then
    R.invokeHandlers[idOf[u]] = v
    hookInvoke(idOf[u])
    return
  end
  if type(v) == "function" and k ~= "OnInvoke" and k ~= "ErrorCallback" and k ~= "ConfirmationCallback" and k ~= "ProcessReceipt" then
    R.invokeHandlers[idOf[u] .. ":" .. tostring(k)] = v
    return
  end
  local ok, err = pcall(origNewindex, u, k, v)
  if not ok then error((gsub(tostring(err), "^runtime2018:%d+: ", "")), 2) end
end

E.core = { set = {}, get = {} }
LM.RegisterSetCore = function(self, id, name, fn) E.core.set[tostring(name)] = fn end
LM.RegisterGetCore = function(self, id, name, fn) E.core.get[tostring(name)] = fn end
LM.SetCore = function(self, id, name, ...)
  local f = E.core.set[tostring(name)]
  if not f then error("SetCore: " .. tostring(name) .. " has not been registered by the CoreScripts", 2) end
  return f(...)
end
LM.GetCore = function(self, id, name)
  local f = E.core.get[tostring(name)]
  if not f then error("GetCore: " .. tostring(name) .. " has not been registered by the CoreScripts", 2) end
  return f()
end

E.renderSteps = {}
LM.BindToRenderStep = function(self, id, name, priority, fn)
  if type(fn) ~= "function" then error("BindToRenderStep: function expected", 2) end
  name = tostring(name)
  for i = #E.renderSteps, 1, -1 do if E.renderSteps[i].name == name then tremove(E.renderSteps, i) end end
  E.renderSteps[#E.renderSteps + 1] = { name = name, priority = tonumber(priority) or 0, fn = fn, script = scriptOf[co_running() or false], seq = #E.renderSteps }
  sort(E.renderSteps, function(a, b) if a.priority == b.priority then return a.seq < b.seq end return a.priority < b.priority end)
end
LM.UnbindFromRenderStep = function(self, id, name)
  name = tostring(name)
  for i = #E.renderSteps, 1, -1 do if E.renderSteps[i].name == name then tremove(E.renderSteps, i) end end
end

local function easeIn(style, x)
  if style == "Linear" then return x
  elseif style == "Sine" then return 1 - cos(x * pi / 2)
  elseif style == "Back" then return 2.70158 * x * x * x - 1.70158 * x * x
  elseif style == "Quad" then return x * x
  elseif style == "Quart" then return x * x * x * x
  elseif style == "Quint" then return x * x * x * x * x
  elseif style == "Bounce" then
    local y = 1 - x
    local n1, d1 = 7.5625, 2.75
    local b
    if y < 1 / d1 then b = n1 * y * y
    elseif y < 2 / d1 then y = y - 1.5 / d1; b = n1 * y * y + 0.75
    elseif y < 2.5 / d1 then y = y - 2.25 / d1; b = n1 * y * y + 0.9375
    else y = y - 2.625 / d1; b = n1 * y * y + 0.984375 end
    return 1 - b
  elseif style == "Elastic" then
    if x <= 0 then return 0 elseif x >= 1 then return 1 end
    return -(2 ^ (10 * x - 10)) * sin((x * 10 - 10.75) * (2 * pi / 3))
  end
  return x * x
end
local function ease(style, dir, x)
  if dir == "In" then return easeIn(style, x)
  elseif dir == "Out" then return 1 - easeIn(style, 1 - x) end
  if x < 0.5 then return easeIn(style, x * 2) / 2 end
  return 1 - easeIn(style, (1 - x) * 2) / 2
end
E.ease = ease

local function lerp(a, b, t)
  local ta = type(a)
  if ta == "number" then return a + (b - a) * t end
  if ta == "boolean" or ta == "string" then return t >= 1 and b or a end
  if ta == "table" then
    local m = getmetatable(a)
    if m == R.V3MT then return Vector3.new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t) end
    if m == R.V2MT then return Vector2.new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t) end
    if m == R.C3MT then return Color3.new(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t) end
    if m == R.UD2MT then return UDim2.new(a.X.Scale + (b.X.Scale - a.X.Scale) * t, a.X.Offset + (b.X.Offset - a.X.Offset) * t, a.Y.Scale + (b.Y.Scale - a.Y.Scale) * t, a.Y.Offset + (b.Y.Offset - a.Y.Offset) * t) end
    if m == R.UDMT then return UDim.new(a.Scale + (b.Scale - a.Scale) * t, a.Offset + (b.Offset - a.Offset) * t) end
    if m == R.CFMT then return a:lerp(b, t) end
    if m == NRMT then return nrnew(a.Min + (b.Min - a.Min) * t, a.Max + (b.Max - a.Max) * t) end
    if m == RectMT then return rectnew(lerp(a.Min, b.Min, t), lerp(a.Max, b.Max, t)) end
  end
  return t >= 1 and b or a
end

E.tweens = {}
local active = {}
local function setState(id, name)
  pcall(function() wrap(id).PlaybackState = Enum.PlaybackState[name] end)
end
local function finishTween(tw, state)
  active[tw.id] = nil
  setState(tw.id, state)
  fireLocal(subKey(tw.id, "Completed"), Enum.PlaybackState[state])
end
LM.Create = function(self, id, target, info, goals)
  if not isInstance(target) then error("TweenService:Create no instance provided", 2) end
  if getmetatable(info) ~= TIMT then error("TweenService:Create no TweenInfo provided", 2) end
  if type(goals) ~= "table" then error("TweenService:Create no property table provided", 2) end
  for k, v in pairs(goals) do
    local cur = target[k]
    if type(cur) ~= type(v) then error("TweenService:Create property " .. tostring(k) .. " is not tweenable", 2) end
  end
  local tid = call(id, "__newTween", target)
  local tw = { id = idOf[tid], target = target, info = info, goals = goals, state = "Begin" }
  E.tweens[tw.id] = tw
  return tid
end
local function tweenOf(id) return E.tweens[id] end
LM.Play = function(self, id, ...)
  local tw = tweenOf(id)
  if not tw then return call(id, "Play", ...) end
  if tw.state == "Playing" or tw.state == "Delayed" then return end
  if tw.state ~= "Paused" then
    tw.from = {}
    for k in pairs(tw.goals) do tw.from[k] = tw.target[k] end
    tw.elapsed = -tw.info.DelayTime
    tw.loops = 0
    tw.back = false
  end
  for oid, other in pairs(active) do
    if other.target == tw.target and other ~= tw then
      for k in pairs(tw.goals) do
        if other.goals[k] ~= nil then finishTween(other, "Cancelled") break end
      end
    end
  end
  tw.state = tw.elapsed < 0 and "Delayed" or "Playing"
  setState(id, tw.state)
  tw.last = R.now()
  active[id] = tw
end
LM.Pause = function(self, id, ...)
  local tw = tweenOf(id)
  if not tw then return call(id, "Pause", ...) end
  if active[id] then
    active[id] = nil
    tw.state = "Paused"
    setState(id, "Paused")
  end
end
LM.Cancel = function(self, id, ...)
  local tw = tweenOf(id)
  if not tw then return call(id, "Cancel", ...) end
  tw.state = "Cancelled"
  if active[id] then finishTween(tw, "Cancelled") else setState(id, "Cancelled") end
end
local function stepTweens(t)
  for id, tw in pairs(active) do
    local dt = t - (tw.last or t)
    tw.last = t
    tw.elapsed = tw.elapsed + dt
    if tw.target and not R.J.alive(idOf[tw.target]) then
      active[id] = nil
    elseif tw.elapsed >= 0 then
      if tw.state == "Delayed" then
        tw.state = "Playing"
        setState(id, "Playing")
      end
      local dur = tw.info.Time
      local k = dur <= 0 and 1 or min(1, tw.elapsed / dur)
      local a = ease(tw.info.EasingStyle.Name, tw.info.EasingDirection.Name, k)
      if tw.back then a = 1 - a end
      for name, goal in pairs(tw.goals) do
        local from = tw.from[name]
        pcall(function() tw.target[name] = lerp(from, goal, a) end)
      end
      if k >= 1 then
        if tw.info.Reverses and not tw.back then
          tw.back = true
          tw.elapsed = 0
        elseif tw.info.RepeatCount < 0 or tw.loops < tw.info.RepeatCount then
          tw.loops = tw.loops + 1
          tw.back = false
          tw.elapsed = -tw.info.DelayTime
        else
          tw.state = "Completed"
          finishTween(tw, "Completed")
        end
      end
    end
  end
end

E.cas = { actions = {}, order = 0 }
local function casInputs(...)
  local list = {}
  for i = 1, select("#", ...) do
    local v = select(i, ...)
    if R.isEnumItem(v) then list[#list + 1] = v
    elseif type(v) == "string" and #v > 0 then list[#list + 1] = v:lower() end
  end
  return list
end
local function casBind(id, name, fn, touch, priority, core, ...)
  name = tostring(name)
  if type(fn) ~= "function" then error("Argument 2 missing or nil", 3) end
  local old = E.cas.actions[name]
  if old and old.core == core then E.cas.actions[name] = nil end
  E.cas.order = E.cas.order + 1
  local info = { title = "", image = "", description = "", createTouchButton = touch and true or false, inputTypes = { ... } }
  E.cas.actions[name] = { fn = fn, info = info, inputs = casInputs(...), priority = priority, core = core, seq = E.cas.order, script = scriptOf[co_running() or false] }
  R.CAS.actions[name] = { fn = fn, info = info, keys = {} }
  fireLocal(subKey(id, "BoundActionAdded"), name, info.createTouchButton, info, core)
  if touch and core then fireLocal(subKey(id, "BoundActionAdded"), name, true, info, true) end
end
local DEFAULT_PRIORITY = 2000
LM.BindAction = function(self, id, name, fn, touch, ...) casBind(id, name, fn, touch, DEFAULT_PRIORITY, false, ...) end
LM.BindActionToInputTypes = LM.BindAction
LM.BindActionAtPriority = function(self, id, name, fn, touch, priority, ...) casBind(id, name, fn, touch, tonumber(priority) or DEFAULT_PRIORITY, false, ...) end
LM.BindCoreAction = function(self, id, name, fn, touch, ...) casBind(id, name, fn, touch, DEFAULT_PRIORITY, true, ...) end
LM.BindCoreActionAtPriority = function(self, id, name, fn, touch, priority, ...) casBind(id, name, fn, touch, tonumber(priority) or DEFAULT_PRIORITY, true, ...) end
local function casUnbind(id, name, core)
  name = tostring(name)
  local a = E.cas.actions[name]
  if not a or a.core ~= core then return end
  E.cas.actions[name] = nil
  R.CAS.actions[name] = nil
  R.CAS.buttons[name] = nil
  fireLocal(subKey(id, "BoundActionRemoved"), name, a.info, core)
end
LM.UnbindAction = function(self, id, name) casUnbind(id, name, false) end
LM.UnbindCoreAction = function(self, id, name) casUnbind(id, name, true) end
LM.UnbindAllActions = function(self, id)
  local names = {}
  for n, a in pairs(E.cas.actions) do if not a.core then names[#names + 1] = n end end
  for _, n in ipairs(names) do casUnbind(id, n, false) end
end
LM.GetAllBoundActionInfo = function(self, id)
  local out = {}
  for n, a in pairs(E.cas.actions) do if not a.core then out[n] = a.info end end
  return out
end
LM.GetAllBoundCoreActionInfo = function(self, id)
  local out = {}
  for n, a in pairs(E.cas.actions) do if a.core then out[n] = a.info end end
  return out
end
LM.GetBoundActionInfo = function(self, id, name)
  local a = E.cas.actions[tostring(name)]
  return a and a.info or {}
end
LM.GetBoundCoreActionInfo = LM.GetBoundActionInfo
LM.GetCurrentLocalToolIcon = function() return "" end
LM.CallFunction = function(self, id, name, state, io)
  local a = E.cas.actions[tostring(name)]
  if a then
    local co = newThread(a.fn)
    scriptOf[co] = a.script
    resume(co, tostring(name), state, io)
  end
end

local ACTION_KEYS = {
  CharacterForward = { "W", "Up" }, CharacterBackward = { "S", "Down" },
  CharacterLeft = { "A" }, CharacterRight = { "D" }, CharacterJump = { "Space" },
}
local function matches(a, io)
  local kc, ut = io.KeyCode, io.UserInputType
  for _, inp in ipairs(a.inputs) do
    if type(inp) == "table" then
      if inp == kc or inp == ut then return true end
      if inp.EnumType == "PlayerActions" and ut == Enum.UserInputType.Keyboard then
        for _, name in ipairs(ACTION_KEYS[inp.Name] or {}) do
          if kc == Enum.KeyCode[name] then return true end
        end
      end
    end
  end
  return false
end

local function runAction(a, name, state, io)
  local result
  local co = newThread(function(...) result = a.fn(...) end)
  scriptOf[co] = a.script
  resume(co, name, state, io)
  return result
end

E.held = {}
local function dispatchCAS(io, state)
  local list = {}
  for n, a in pairs(E.cas.actions) do
    if matches(a, io) then list[#list + 1] = { n, a } end
  end
  if #list == 0 then return false end
  sort(list, function(x, y)
    if x[2].priority == y[2].priority then return x[2].seq > y[2].seq end
    return x[2].priority > y[2].priority
  end)
  for _, pair in ipairs(list) do
    local r = runAction(pair[2], pair[1], state, io)
    if r ~= Enum.ContextActionResult.Pass then return true, pair[1] end
  end
  return false
end

local uisId
E.input = function(io, processed, kind)
  if not uisId then uisId = idOf[call(0, "GetService", "UserInputService")] end
  local state = kind == "b" and Enum.UserInputState.Begin or (kind == "e" and Enum.UserInputState.End or Enum.UserInputState.Change)
  local sunk = false
  if not processed and (kind == "b" or kind == "e") then
    local key = tostring(io.KeyCode) .. tostring(io.UserInputType)
    if kind == "e" and E.held[key] then
      local name = E.held[key]
      E.held[key] = nil
      local a = E.cas.actions[name]
      if a then runAction(a, name, state, io) sunk = true end
    elseif kind == "b" then
      local hit, name = dispatchCAS(io, state)
      if hit then E.held[key] = name; sunk = true end
    end
  elseif not processed and kind == "c" and io.UserInputType ~= Enum.UserInputType.MouseMovement then
    local hit = dispatchCAS(io, state)
    if hit then sunk = true end
  end
  local ev = kind == "b" and "InputBegan" or (kind == "e" and "InputEnded" or "InputChanged")
  fireLocal(subKey(uisId, ev), io, processed or sunk)
end

if R.SIDE == "client" then
  local uis = call(0, "GetService", "UserInputService")
  makeSignal(idOf[uis], "__Input"):connect(function(io, processed, kind) E.input(io, processed, kind) end)
end

local JSON = {}
local function jsonEsc(s)
  return '"' .. gsub(s, '[%c"\\]', function(c)
    local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t', ['\b'] = '\\b', ['\f'] = '\\f' }
    return m[c] or fmt("\\u%04x", byte(c))
  end) .. '"'
end
function JSON.encode(v, depth)
  depth = depth or 0
  if depth > 100 then error("Can't convert to JSON: nesting too deep", 0) end
  local t = type(v)
  if v == nil then return "null"
  elseif t == "boolean" then return tostring(v)
  elseif t == "number" then
    if v ~= v or v == huge or v == -huge then return "null" end
    if v == floor(v) and abs(v) < 1e15 then return fmt("%d", v) end
    return fmt("%.14g", v)
  elseif t == "string" then return jsonEsc(v)
  elseif t == "table" then
    local n = #v
    local isArr = n > 0 or next(v) == nil
    if isArr then
      for k in pairs(v) do if type(k) ~= "number" then isArr = false break end end
    end
    local out = {}
    if isArr then
      for i = 1, n do out[i] = JSON.encode(v[i], depth + 1) end
      return "[" .. concat(out, ",") .. "]"
    end
    for k, x in pairs(v) do
      if type(k) ~= "string" and type(k) ~= "number" then error("Can't convert to JSON", 0) end
      out[#out + 1] = jsonEsc(tostring(k)) .. ":" .. JSON.encode(x, depth + 1)
    end
    return "{" .. concat(out, ",") .. "}"
  end
  return "null"
end
function JSON.decode(s)
  local i = 1
  local function ws() i = string.find(s, "[^ \t\r\n]", i) or #s + 1 end
  local val
  local function str()
    i = i + 1
    local out = {}
    while true do
      local c = sub(s, i, i)
      if c == "" then error("Can't parse JSON", 0) end
      if c == '"' then i = i + 1 break end
      if c == "\\" then
        local e = sub(s, i + 1, i + 1)
        local m = { b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }
        if e == "u" then
          out[#out + 1] = utf8x.char(tonumber(sub(s, i + 2, i + 5), 16) or 63)
          i = i + 6
        else
          out[#out + 1] = m[e] or e
          i = i + 2
        end
      else
        out[#out + 1] = c
        i = i + 1
      end
    end
    return concat(out)
  end
  val = function()
    ws()
    local c = sub(s, i, i)
    if c == "{" then
      i = i + 1
      local t = {}
      ws()
      if sub(s, i, i) == "}" then i = i + 1 return t end
      while true do
        ws()
        local k = str()
        ws()
        if sub(s, i, i) ~= ":" then error("Can't parse JSON", 0) end
        i = i + 1
        t[k] = val()
        ws()
        local d = sub(s, i, i)
        i = i + 1
        if d == "}" then return t end
        if d ~= "," then error("Can't parse JSON", 0) end
      end
    elseif c == "[" then
      i = i + 1
      local t = {}
      ws()
      if sub(s, i, i) == "]" then i = i + 1 return t end
      while true do
        t[#t + 1] = val()
        ws()
        local d = sub(s, i, i)
        i = i + 1
        if d == "]" then return t end
        if d ~= "," then error("Can't parse JSON", 0) end
      end
    elseif c == '"' then return str()
    elseif sub(s, i, i + 3) == "true" then i = i + 4 return true
    elseif sub(s, i, i + 4) == "false" then i = i + 5 return false
    elseif sub(s, i, i + 3) == "null" then i = i + 4 return nil
    end
    local num = string.match(s, "^-?%d+%.?%d*[eE]?[-+]?%d*", i)
    if not num or num == "" then error("Can't parse JSON", 0) end
    i = i + #num
    return tonumber(num)
  end
  local ok, r = pcall(val)
  if not ok then error("Can't parse JSON", 2) end
  return r
end
LM.JSONEncode = function(self, id, v)
  local ok, r = pcall(JSON.encode, v)
  if not ok then error(r, 2) end
  return r
end
LM.JSONDecode = function(self, id, s)
  if type(s) ~= "string" then error("Can't parse JSON", 2) end
  return JSON.decode(s)
end
LM.UrlEncode = function(self, id, s)
  return (gsub(tostring(s), "[^%w%-_%.~]", function(c) return fmt("%%%02X", byte(c)) end))
end

local function dsCheck(id)
  if R.SIDE ~= "server" then error("DataStore can't be accessed from client", 3) end
end
LM.GetDataStore = function(self, id, name, scope)
  return call(id, "__dataStore", tostring(name), tostring(scope or "global"), false)
end
LM.GetGlobalDataStore = function(self, id) return call(id, "__dataStore", "__global", "global", false) end
LM.GetOrderedDataStore = function(self, id, name, scope)
  return call(id, "__dataStore", tostring(name), tostring(scope or "global"), true)
end
local function dsGet(id, key)
  local raw = call(id, "__dsGet", tostring(key))
  if raw == nil then return nil end
  local ok, v = pcall(JSON.decode, raw)
  if ok then return v end
  return nil
end
local function dsSet(id, key, v)
  if v == nil then call(id, "__dsSet", tostring(key), nil) return end
  local ok, json = pcall(JSON.encode, v)
  if not ok then error("Cannot store " .. typeName(v) .. " in DataStore", 3) end
  if #json > 260000 then error("Value is too large for the DataStore", 3) end
  call(id, "__dsSet", tostring(key), json)
end
local function isStore(id) return call(id, "IsA", "GlobalDataStore") end
LM.GetAsync = function(self, id, key, ...)
  if not isStore(id) then return callAsync(id, "GetAsync", key, ...) end
  dsCheck(id)
  sched_wait(0)
  return dsGet(id, key)
end
LM.SetAsync = function(self, id, key, value)
  dsCheck(id)
  sched_wait(0)
  dsSet(id, key, value)
end
LM.UpdateAsync = function(self, id, key, fn)
  dsCheck(id)
  if type(fn) ~= "function" then error("UpdateAsync: function expected", 2) end
  sched_wait(0)
  local new = fn(dsGet(id, key))
  if new ~= nil then dsSet(id, key, new) end
  return new
end
LM.IncrementAsync = function(self, id, key, delta)
  dsCheck(id)
  sched_wait(0)
  local cur = tonumber(dsGet(id, key)) or 0
  local v = cur + math.floor(tonumber(delta) or 1)
  dsSet(id, key, v)
  return v
end
LM.RemoveAsync = function(self, id, key)
  dsCheck(id)
  local old = dsGet(id, key)
  dsSet(id, key, nil)
  return old
end
LM.OnUpdate = function(self, id, key, fn)
  return newLocalSignal("OnUpdate"):connect(fn)
end
LM.GetSortedAsync = function(self, id, asc, size)
  dsCheck(id)
  local list = call(id, "__dsSorted", asc and true or false, tonumber(size) or 50)
  local page = { IsFinished = true }
  function page:GetCurrentPage() return list end
  function page:AdvanceToNextPageAsync() end
  return page
end

LM.GetAssetThumbnailAsync = function(self, id, ...) return callAsync(id, "GetAssetThumbnailAsync", ...) end
LM.BindToClose = function(self, id, fn)
  if type(fn) ~= "function" then error("BindToClose: function expected", 2) end
  call(id, "__CloseBound")
  makeSignal(id, "__Close"):connect(fn)
end
LM.GetGroupsAsync = function(self, id, ...) return callAsync(id, "GetGroupsAsync", ...) end
LM.GetGroupInfoAsync = function(self, id, ...) return callAsync(id, "GetGroupInfoAsync", ...) end

local loc = {}
LM.SetEntries = function(self, id, entries)
  if type(entries) ~= "table" then error("SetEntries: table expected", 2) end
  loc[id] = entries
end
LM.GetEntries = function(self, id) return loc[id] or {} end
local function locFind(id, key, source)
  for _, e in ipairs(loc[id] or {}) do
    if (key and e.Key == key) or (source and e.Source == source) then return e end
  end
end
LM.GetString = function(self, id, locale, key)
  local e = locFind(id, key)
  if not e then error("GetString: key " .. tostring(key) .. " not found", 2) end
  local v = e.Values and (e.Values[locale] or e.Values["en-us"]) or e.Source
  if v == nil then error("GetString: no value for " .. tostring(key), 2) end
  return v
end
LM.GetTranslator = function(self, id, locale)
  local t = {}
  t.LocaleId = locale
  function t:FormatByKey(key, args)
    local e = locFind(id, key)
    local s = e and (e.Values and (e.Values[locale] or e.Values["en-us"]) or e.Source)
    if not s then error("FormatByKey: key " .. tostring(key) .. " not found", 2) end
    if type(args) == "table" then
      s = gsub(s, "{([%w_]+)}", function(k) local v = args[k] or args[tonumber(k) and tonumber(k) + 1 or 0] return v ~= nil and tostring(v) or nil end)
    end
    return s
  end
  function t:Translate(context, text) return text end
  return t
end

return {
  step = function(t, dt)
    stepTweens(t)
  end,
  renderStep = function(t, dt)
    if R.SIDE == "client" and #E.renderSteps > 0 then
      local list = {}
      for i, r in ipairs(E.renderSteps) do list[i] = r end
      for _, r in ipairs(list) do
        local sid = r.script and idOf[r.script]
        if not sid or R.J.running(sid) then
          local co = newThread(r.fn)
          scriptOf[co] = r.script
          resume(co, dt)
        else
          LM.UnbindFromRenderStep(nil, nil, r.name)
        end
      end
    end
  end,
  luaMethods = function()
    local names = {}
    for k in pairs(LM) do if type(k) == "string" and sub(k, 1, 2) ~= "__" then names[#names + 1] = k end end
    return concat(names, " ")
  end,
}
