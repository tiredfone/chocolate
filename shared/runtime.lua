local J = ...
local JS_GET, JS_SET, JS_CALL, JS_NEW, JS_SUB, JS_UNSUB, JS_POLL, JS_LOG, JS_NOW = J.get, J.set, J.call, J.new, J.sub, J.unsub, J.poll, J.log, J.now
local DATA = loadstring(J.data)()
local SIDE, BRICKS, ENUMDATA, PALETTE = J.side, DATA.bricks, DATA.enums, DATA.palette

local type, pairs, ipairs, next, select, tostring, tonumber, error, assert, rawget, rawset, rawequal, setmetatable, getmetatable, unpack, pcall =
  type, pairs, ipairs, next, select, tostring, tonumber, error, assert, rawget, rawset, rawequal, setmetatable, getmetatable, unpack, pcall
local newproxy, setfenv, getfenv, loadstring, xpcall = newproxy, setfenv, getfenv, loadstring, xpcall
local co_create, co_resume, co_yield, co_status, co_running, co_wrap = coroutine.create, coroutine.resume, coroutine.yield, coroutine.status, coroutine.running, coroutine.wrap
local sqrt, abs, floor, cos, sin, atan2, asin, acos, huge, random, min, max, pi = math.sqrt, math.abs, math.floor, math.cos, math.sin, math.atan2, math.asin, math.acos, math.huge, math.random, math.min, math.max, math.pi
local fmt, sub, upper, lower, gsub, find, rep = string.format, string.sub, string.upper, string.lower, string.gsub, string.find, string.rep
local tinsert, tremove, concat, sort, maxn = table.insert, table.remove, table.concat, table.sort, table.maxn
local dbg_sethook, dbg_traceback = debug.sethook, debug.traceback
local os_time, os_clock, os_date, os_difftime = os.time, os.clock, os.date, os.difftime

io = nil
package = nil
require = nil
dofile = nil
loadfile = nil
debug = nil
os = { time = os_time, clock = os_clock, date = os_date, difftime = os_difftime }
string.dump = nil
collectgarbage = function(opt)
  if opt == "count" then return gcinfo() end
  return 0
end

local function fnum(v)
  local s = fmt("%.14g", v)
  if s == "-0" then s = "0" end
  return s
end

local proxyOf = setmetatable({}, { __mode = "v" })
local idOf = setmetatable({}, { __mode = "k" })
local signalCache = setmetatable({}, { __mode = "v" })
local methodCache = {}
local LuaMethods = { __ext = { enc = {}, dec = {} } }
LuaMethods.__locked = {}
LuaMethods.__utf8 = function(s)
  if not string.find(s, "[\128-\255]") then return true end
  local i, n, byte = 1, #s, string.byte
  while i <= n do
    local c = byte(s, i)
    if c < 128 then i = i + 1
    elseif c >= 194 and c <= 223 then
      local c2 = byte(s, i + 1)
      if not c2 or c2 < 128 or c2 > 191 then return false end
      i = i + 2
    elseif c >= 224 and c <= 239 then
      local c2, c3 = byte(s, i + 1, i + 2)
      if not c3 or c2 < 128 or c2 > 191 or c3 < 128 or c3 > 191 or (c == 224 and c2 < 160) or (c == 237 and c2 > 159) then return false end
      i = i + 3
    elseif c >= 240 and c <= 244 then
      local c2, c3, c4 = byte(s, i + 1, i + 3)
      if not c4 or c2 < 128 or c2 > 191 or c3 < 128 or c3 > 191 or c4 < 128 or c4 > 191 or (c == 240 and c2 < 144) or (c == 244 and c2 > 143) then return false end
      i = i + 4
    else return false end
  end
  return true
end
LuaMethods.__coreScript = {}
LuaMethods.__gameEnv = setmetatable({}, { __mode = "k" })
LuaMethods.__coreEnv = setmetatable({}, { __mode = "k" })
LuaMethods.__envOf = setmetatable({}, { __mode = "k" })
LuaMethods.__rtEnvs = { [getfenv(1)] = true }
local InstanceMT
local template

local Vector3, Vector2, CFrame, Color3, BrickColor, UDim2, UDim, Ray, Region3, Enum, EnumItemMT
local V3MT, V2MT, CFMT, C3MT, BCMT, UD2MT, UDMT, RayMT, R3MT

local isV3, isCF, isC3, isBC, isUD2, isV2, isRay, isEnumItem

local function wrap(id)
  if id == nil then return nil end
  local p = proxyOf[id]
  if p then return p end
  p = newproxy(template)
  proxyOf[id] = p
  idOf[p] = id
  return p
end

local function isInstance(v)
  return type(v) == "userdata" and idOf[v] ~= nil
end

local enc
local function encInto(out, v)
  local t = type(v)
  if v == nil then out[#out + 1] = "nil"
  elseif t == "boolean" then out[#out + 1] = "b"; out[#out + 1] = v
  elseif t == "number" then out[#out + 1] = "n"; out[#out + 1] = v
  elseif t == "string" then
    if LuaMethods.__utf8(v) then out[#out + 1] = "s"; out[#out + 1] = v
    else out[#out + 1] = "sx"; out[#out + 1] = (gsub(v, ".", function(ch) return fmt("%02x", string.byte(ch)) end)) end
  elseif t == "userdata" then
    local id = idOf[v]
    if id then out[#out + 1] = "i"; out[#out + 1] = id else out[#out + 1] = "nil" end
  elseif t == "table" then
    local mt = getmetatable(v)
    if mt == V3MT then out[#out + 1] = "v3"; out[#out + 1] = v.X; out[#out + 1] = v.Y; out[#out + 1] = v.Z
    elseif mt == CFMT then
      out[#out + 1] = "cf"
      for i = 1, 12 do out[#out + 1] = v[i] end
    elseif mt == C3MT then out[#out + 1] = "c3"; out[#out + 1] = v.r; out[#out + 1] = v.g; out[#out + 1] = v.b
    elseif mt == BCMT then out[#out + 1] = "bc"; out[#out + 1] = v.Number
    elseif mt == UD2MT then out[#out + 1] = "ud2"; out[#out + 1] = v.X.Scale; out[#out + 1] = v.X.Offset; out[#out + 1] = v.Y.Scale; out[#out + 1] = v.Y.Offset
    elseif mt == UDMT then out[#out + 1] = "ud"; out[#out + 1] = v.Scale; out[#out + 1] = v.Offset
    elseif mt == V2MT then out[#out + 1] = "v2"; out[#out + 1] = v.X; out[#out + 1] = v.Y
    elseif mt == RayMT then
      out[#out + 1] = "ray"
      local o, d = v.Origin, v.Direction
      out[#out + 1] = o.X; out[#out + 1] = o.Y; out[#out + 1] = o.Z; out[#out + 1] = d.X; out[#out + 1] = d.Y; out[#out + 1] = d.Z
    elseif mt == EnumItemMT then out[#out + 1] = "e"; out[#out + 1] = v.EnumType; out[#out + 1] = v.Value
    elseif mt and LuaMethods.__ext.enc[mt] then LuaMethods.__ext.enc[mt](out, v)
    elseif mt == nil and LuaMethods.__ext.dict and next(v) ~= nil and v[1] == nil then LuaMethods.__ext.dict(out, v, encInto)
    else
      local n = #v
      out[#out + 1] = "l"; out[#out + 1] = n
      for i = 1, n do encInto(out, v[i]) end
    end
  else
    out[#out + 1] = "nil"
  end
end

enc = function(...)
  local out = {}
  for i = 1, select("#", ...) do encInto(out, (select(i, ...))) end
  return out
end

local function dec1(a, i)
  local tag = a[i]
  if tag == "nil" or tag == nil then return nil, i + 1
  elseif tag == "b" or tag == "n" or tag == "s" then return a[i + 1], i + 2
  elseif tag == "sx" then return (gsub(a[i + 1], "%x%x", function(x) return string.char(tonumber(x, 16)) end)), i + 2
  elseif tag == "i" then return wrap(a[i + 1]), i + 2
  elseif tag == "v3" then return Vector3.new(a[i + 1], a[i + 2], a[i + 3]), i + 4
  elseif tag == "cf" then
    return setmetatable({ a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5], a[i + 6], a[i + 7], a[i + 8], a[i + 9], a[i + 10], a[i + 11], a[i + 12] }, CFMT), i + 13
  elseif tag == "c3" then return Color3.new(a[i + 1], a[i + 2], a[i + 3]), i + 4
  elseif tag == "bc" then return BrickColor.new(a[i + 1]), i + 2
  elseif tag == "ud2" then return UDim2.new(a[i + 1], a[i + 2], a[i + 3], a[i + 4]), i + 5
  elseif tag == "ud" then return UDim.new(a[i + 1], a[i + 2]), i + 3
  elseif tag == "v2" then return Vector2.new(a[i + 1], a[i + 2]), i + 3
  elseif tag == "ray" then return Ray.new(Vector3.new(a[i + 1], a[i + 2], a[i + 3]), Vector3.new(a[i + 4], a[i + 5], a[i + 6])), i + 7
  elseif tag == "e" then
    local e = Enum[a[i + 1]]
    return e and e:FromValue(a[i + 2]) or a[i + 2], i + 3
  elseif tag == "l" then
    local n = a[i + 1]
    local t = {}
    i = i + 2
    for k = 1, n do t[k], i = dec1(a, i) end
    return t, i
  elseif tag == "d" then
    local n = a[i + 1]
    local t = {}
    i = i + 2
    for k = 1, n do
      local key = a[i]
      if type(key) == "string" and sub(key, 1, 1) == "#" and tonumber(sub(key, 2)) then key = tonumber(sub(key, 2)) end
      t[key], i = dec1(a, i + 1)
    end
    return t, i
  end
  local ext = LuaMethods.__ext.dec[tag]
  if ext then return ext(a, i) end
  return nil, i + 1
end

local function decAll(a, i)
  i = i or 0
  local out, n = {}, 0
  while a[i] ~= nil do
    n = n + 1
    out[n], i = dec1(a, i)
  end
  return out, n
end

local function decResult(a, level)
  if a[0] == "err" then error(a[1], (level or 1) + 1) end
  local out, n = decAll(a, 1)
  return unpack(out, 1, n)
end

local function rgbBrick(n)
  local b = BRICKS[n]
  return b
end

local function vnew(x, y, z)
  return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, V3MT)
end

V3MT = {}
isV3 = function(v) return type(v) == "table" and getmetatable(v) == V3MT end
local V3methods = {}
V3MT.__index = function(v, k)
  if k == "x" then return rawget(v, "X")
  elseif k == "y" then return rawget(v, "Y")
  elseif k == "z" then return rawget(v, "Z")
  elseif k == "magnitude" or k == "Magnitude" then return sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z)
  elseif k == "unit" or k == "Unit" then
    local m = sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z)
    if m == 0 then return vnew(0, 0, 0) end
    return vnew(v.X / m, v.Y / m, v.Z / m)
  end
  local f = V3methods[k]
  if f then return f end
  error(tostring(k) .. " is not a valid member of Vector3", 2)
end
V3MT.__newindex = function() error("Vector3 properties are read-only", 2) end
V3MT.__add = function(a, b)
  if not isV3(a) or not isV3(b) then error("bad argument to Vector3 +", 2) end
  return vnew(a.X + b.X, a.Y + b.Y, a.Z + b.Z)
end
V3MT.__sub = function(a, b)
  if not isV3(a) or not isV3(b) then error("bad argument to Vector3 -", 2) end
  return vnew(a.X - b.X, a.Y - b.Y, a.Z - b.Z)
end
V3MT.__mul = function(a, b)
  if type(a) == "number" then return vnew(a * b.X, a * b.Y, a * b.Z) end
  if type(b) == "number" then return vnew(a.X * b, a.Y * b, a.Z * b) end
  return vnew(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
V3MT.__div = function(a, b)
  if type(b) == "number" then return vnew(a.X / b, a.Y / b, a.Z / b) end
  if type(a) == "number" then return vnew(a / b.X, a / b.Y, a / b.Z) end
  return vnew(a.X / b.X, a.Y / b.Y, a.Z / b.Z)
end
V3MT.__unm = function(a) return vnew(-a.X, -a.Y, -a.Z) end
V3MT.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
V3MT.__tostring = function(v) return fnum(v.X) .. ", " .. fnum(v.Y) .. ", " .. fnum(v.Z) end
function V3methods.Dot(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end
function V3methods.Cross(a, b) return vnew(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X) end
function V3methods.Lerp(a, b, t) return vnew(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t) end
function V3methods.isClose(a, b, eps)
  eps = eps or 1e-5
  return abs(a.X - b.X) <= eps and abs(a.Y - b.Y) <= eps and abs(a.Z - b.Z) <= eps
end
V3methods.dot, V3methods.cross, V3methods.lerp, V3methods.IsClose = V3methods.Dot, V3methods.Cross, V3methods.Lerp, V3methods.isClose
Vector3 = { new = function(x, y, z) return vnew(tonumber(x) or 0, tonumber(y) or 0, tonumber(z) or 0) end }
Vector3.FromNormalId = function(n)
  local v = type(n) == "table" and n.Value or n
  local t = { [0] = vnew(1, 0, 0), vnew(0, 1, 0), vnew(0, 0, 1), vnew(-1, 0, 0), vnew(0, -1, 0), vnew(0, 0, -1) }
  return t[v] or vnew(0, 0, 0)
end
Vector3.FromAxis = function(n)
  local v = type(n) == "table" and n.Value or n
  local t = { [0] = vnew(1, 0, 0), vnew(0, 1, 0), vnew(0, 0, 1) }
  return t[v] or vnew(0, 0, 0)
end
Vector3.fromNormalId, Vector3.fromAxis = Vector3.FromNormalId, Vector3.FromAxis

V2MT = {}
isV2 = function(v) return type(v) == "table" and getmetatable(v) == V2MT end
local function v2new(x, y) return setmetatable({ X = x or 0, Y = y or 0 }, V2MT) end
V2MT.__index = function(v, k)
  if k == "x" then return v.X elseif k == "y" then return v.Y
  elseif k == "magnitude" or k == "Magnitude" then return sqrt(v.X * v.X + v.Y * v.Y)
  elseif k == "unit" or k == "Unit" then
    local m = sqrt(v.X * v.X + v.Y * v.Y)
    return m == 0 and v2new(0, 0) or v2new(v.X / m, v.Y / m)
  elseif k == "Dot" or k == "dot" then return function(a, b) return a.X * b.X + a.Y * b.Y end
  elseif k == "Lerp" or k == "lerp" then return function(a, b, t) return v2new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t) end
  end
  error(tostring(k) .. " is not a valid member of Vector2", 2)
end
V2MT.__add = function(a, b) return v2new(a.X + b.X, a.Y + b.Y) end
V2MT.__sub = function(a, b) return v2new(a.X - b.X, a.Y - b.Y) end
V2MT.__mul = function(a, b)
  if type(a) == "number" then return v2new(a * b.X, a * b.Y) end
  if type(b) == "number" then return v2new(a.X * b, a.Y * b) end
  return v2new(a.X * b.X, a.Y * b.Y)
end
V2MT.__div = function(a, b)
  if type(b) == "number" then return v2new(a.X / b, a.Y / b) end
  return v2new(a.X / b.X, a.Y / b.Y)
end
V2MT.__unm = function(a) return v2new(-a.X, -a.Y) end
V2MT.__eq = function(a, b) return a.X == b.X and a.Y == b.Y end
V2MT.__tostring = function(v) return fnum(v.X) .. ", " .. fnum(v.Y) end
Vector2 = { new = function(x, y) return v2new(tonumber(x) or 0, tonumber(y) or 0) end }

CFMT = {}
isCF = function(v) return type(v) == "table" and getmetatable(v) == CFMT end
local function cfraw(x, y, z, a, b, c, d, e, f, g, h, i)
  return setmetatable({ x, y, z, a, b, c, d, e, f, g, h, i }, CFMT)
end
local function cfmul(A, B)
  local ax, ay, az, a0, a1, a2, a3, a4, a5, a6, a7, a8 = A[1], A[2], A[3], A[4], A[5], A[6], A[7], A[8], A[9], A[10], A[11], A[12]
  local bx, by, bz, b0, b1, b2, b3, b4, b5, b6, b7, b8 = B[1], B[2], B[3], B[4], B[5], B[6], B[7], B[8], B[9], B[10], B[11], B[12]
  return cfraw(
    a0 * bx + a1 * by + a2 * bz + ax, a3 * bx + a4 * by + a5 * bz + ay, a6 * bx + a7 * by + a8 * bz + az,
    a0 * b0 + a1 * b3 + a2 * b6, a0 * b1 + a1 * b4 + a2 * b7, a0 * b2 + a1 * b5 + a2 * b8,
    a3 * b0 + a4 * b3 + a5 * b6, a3 * b1 + a4 * b4 + a5 * b7, a3 * b2 + a4 * b5 + a5 * b8,
    a6 * b0 + a7 * b3 + a8 * b6, a6 * b1 + a7 * b4 + a8 * b7, a6 * b2 + a7 * b5 + a8 * b8)
end
local function cfinv(A)
  local x, y, z, r0, r1, r2, r3, r4, r5, r6, r7, r8 = A[1], A[2], A[3], A[4], A[5], A[6], A[7], A[8], A[9], A[10], A[11], A[12]
  return cfraw(-(r0 * x + r3 * y + r6 * z), -(r1 * x + r4 * y + r7 * z), -(r2 * x + r5 * y + r8 * z), r0, r3, r6, r1, r4, r7, r2, r5, r8)
end
local function cfpoint(A, v)
  return vnew(A[4] * v.X + A[5] * v.Y + A[6] * v.Z + A[1], A[7] * v.X + A[8] * v.Y + A[9] * v.Z + A[2], A[10] * v.X + A[11] * v.Y + A[12] * v.Z + A[3])
end
local function cfvector(A, v)
  return vnew(A[4] * v.X + A[5] * v.Y + A[6] * v.Z, A[7] * v.X + A[8] * v.Y + A[9] * v.Z, A[10] * v.X + A[11] * v.Y + A[12] * v.Z)
end
local function fromQuat(x, y, z, qx, qy, qz, qw)
  local xx, yy, zz = qx * qx, qy * qy, qz * qz
  local xy, xz, yz = qx * qy, qx * qz, qy * qz
  local wx, wy, wz = qw * qx, qw * qy, qw * qz
  return cfraw(x, y, z, 1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy))
end
local function toQuat(A)
  local m00, m01, m02, m10, m11, m12, m20, m21, m22 = A[4], A[5], A[6], A[7], A[8], A[9], A[10], A[11], A[12]
  local tr = m00 + m11 + m22
  local qx, qy, qz, qw
  if tr > 0 then
    local s = sqrt(tr + 1) * 2
    qw, qx, qy, qz = 0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s
  elseif m00 > m11 and m00 > m22 then
    local s = sqrt(1 + m00 - m11 - m22) * 2
    qw, qx, qy, qz = (m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s
  elseif m11 > m22 then
    local s = sqrt(1 + m11 - m00 - m22) * 2
    qw, qx, qy, qz = (m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s
  else
    local s = sqrt(1 + m22 - m00 - m11) * 2
    qw, qx, qy, qz = (m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s
  end
  return qx, qy, qz, qw
end
local function angles(rx, ry, rz)
  local cx, sx, cy, sy, cz, sz = cos(rx), sin(rx), cos(ry), sin(ry), cos(rz), sin(rz)
  return cfraw(0, 0, 0, cy * cz, -cy * sz, sy, cz * sx * sy + cx * sz, cx * cz - sx * sy * sz, -cy * sx, sx * sz - cx * cz * sy, cz * sx + cx * sy * sz, cx * cy)
end
local function lookAt(p, t)
  local fx, fy, fz = t.X - p.X, t.Y - p.Y, t.Z - p.Z
  local fl = sqrt(fx * fx + fy * fy + fz * fz)
  if fl < 1e-9 then return cfraw(p.X, p.Y, p.Z, 1, 0, 0, 0, 1, 0, 0, 0, 1) end
  fx, fy, fz = fx / fl, fy / fl, fz / fl
  local rx, ry, rz = -fz, 0, fx
  local rl = sqrt(rx * rx + rz * rz)
  if rl < 1e-6 then rx, ry, rz = 1, 0, 0 else rx, rz = rx / rl, rz / rl end
  local bx, by, bz = -fx, -fy, -fz
  local ux, uy, uz = by * rz - bz * ry, bz * rx - bx * rz, bx * ry - by * rx
  return cfraw(p.X, p.Y, p.Z, rx, ux, bx, ry, uy, by, rz, uz, bz)
end
local CFmethods = {}
CFMT.__index = function(c, k)
  if k == "p" or k == "Position" or k == "position" then return vnew(c[1], c[2], c[3])
  elseif k == "x" or k == "X" then return c[1]
  elseif k == "y" or k == "Y" then return c[2]
  elseif k == "z" or k == "Z" then return c[3]
  elseif k == "lookVector" or k == "LookVector" then return vnew(-c[6], -c[9], -c[12])
  elseif k == "rightVector" or k == "RightVector" then return vnew(c[4], c[7], c[10])
  elseif k == "upVector" or k == "UpVector" then return vnew(c[5], c[8], c[11])
  end
  local f = CFmethods[k]
  if f then return f end
  error(tostring(k) .. " is not a valid member of CFrame", 2)
end
CFMT.__newindex = function() error("CFrame properties are read-only", 2) end
CFMT.__mul = function(a, b)
  if isCF(b) then return cfmul(a, b) end
  if isV3(b) then return cfpoint(a, b) end
  error("bad argument to CFrame *", 2)
end
CFMT.__add = function(a, b)
  if not isV3(b) then error("bad argument to CFrame +", 2) end
  return cfraw(a[1] + b.X, a[2] + b.Y, a[3] + b.Z, a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12])
end
CFMT.__sub = function(a, b)
  if not isV3(b) then error("bad argument to CFrame -", 2) end
  return cfraw(a[1] - b.X, a[2] - b.Y, a[3] - b.Z, a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12])
end
CFMT.__eq = function(a, b)
  for i = 1, 12 do if a[i] ~= b[i] then return false end end
  return true
end
CFMT.__tostring = function(c)
  local t = {}
  for i = 1, 12 do t[i] = fnum(c[i]) end
  return concat(t, ", ")
end
function CFmethods.inverse(c) return cfinv(c) end
function CFmethods.toWorldSpace(a, b) return cfmul(a, b) end
function CFmethods.toObjectSpace(a, b) return cfmul(cfinv(a), b) end
function CFmethods.pointToWorldSpace(a, v) return cfpoint(a, v) end
function CFmethods.pointToObjectSpace(a, v) return cfpoint(cfinv(a), v) end
function CFmethods.vectorToWorldSpace(a, v) return cfvector(a, v) end
function CFmethods.vectorToObjectSpace(a, v) return cfvector(cfinv(a), v) end
function CFmethods.components(c) return c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12] end
function CFmethods.toEulerAnglesXYZ(c)
  local r02 = max(-1, min(1, c[6]))
  local y = asin(r02)
  local x, z
  if abs(r02) < 0.99999 then
    x = atan2(-c[9], c[12])
    z = atan2(-c[5], c[4])
  else
    x = atan2(c[11], c[8])
    z = 0
  end
  return x, y, z
end
function CFmethods.toAxisAngle(c)
  local qx, qy, qz, qw = toQuat(c)
  local t = 2 * acos(max(-1, min(1, qw)))
  local s = sqrt(max(0, 1 - qw * qw))
  if s < 1e-6 then return vnew(1, 0, 0), 0 end
  return vnew(qx / s, qy / s, qz / s), t
end
function CFmethods.lerp(a, b, t)
  local ax, ay, az, aw = toQuat(a)
  local bx, by, bz, bw = toQuat(b)
  local d = ax * bx + ay * by + az * bz + aw * bw
  if d < 0 then bx, by, bz, bw, d = -bx, -by, -bz, -bw, -d end
  local wa, wb
  if d > 0.9995 then wa, wb = 1 - t, t
  else
    local th = acos(d)
    local s = sin(th)
    wa, wb = sin((1 - t) * th) / s, sin(t * th) / s
  end
  local qx, qy, qz, qw = ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb
  local l = sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
  return fromQuat(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, qx / l, qy / l, qz / l, qw / l)
end
CFmethods.Inverse, CFmethods.ToWorldSpace, CFmethods.ToObjectSpace = CFmethods.inverse, CFmethods.toWorldSpace, CFmethods.toObjectSpace
CFmethods.PointToWorldSpace, CFmethods.PointToObjectSpace = CFmethods.pointToWorldSpace, CFmethods.pointToObjectSpace
CFmethods.VectorToWorldSpace, CFmethods.VectorToObjectSpace = CFmethods.vectorToWorldSpace, CFmethods.vectorToObjectSpace
CFmethods.GetComponents, CFmethods.ToEulerAnglesXYZ, CFmethods.Lerp, CFmethods.ToAxisAngle = CFmethods.components, CFmethods.toEulerAnglesXYZ, CFmethods.lerp, CFmethods.toAxisAngle
CFrame = {}
CFrame.new = function(...)
  local n = select("#", ...)
  local a, b, c = ...
  if n == 0 then return cfraw(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1) end
  if isV3(a) then
    if isV3(b) then return lookAt(a, b) end
    return cfraw(a.X, a.Y, a.Z, 1, 0, 0, 0, 1, 0, 0, 0, 1)
  end
  if n == 7 then
    local x, y, z, qx, qy, qz, qw = ...
    return fromQuat(x, y, z, qx, qy, qz, qw)
  end
  if n >= 12 then
    local t = { ... }
    for i = 1, 12 do t[i] = tonumber(t[i]) or 0 end
    return cfraw(unpack(t, 1, 12))
  end
  return cfraw(tonumber(a) or 0, tonumber(b) or 0, tonumber(c) or 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
end
CFrame.Angles = function(x, y, z) return angles(x or 0, y or 0, z or 0) end
CFrame.fromEulerAnglesXYZ = CFrame.Angles
CFrame.fromAxisAngle = function(v, t)
  local l = v.Magnitude
  if l == 0 then return cfraw(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1) end
  local s = sin(t / 2)
  return fromQuat(0, 0, 0, v.X / l * s, v.Y / l * s, v.Z / l * s, cos(t / 2))
end
CFrame.FromEulerAnglesXYZ, CFrame.FromAxisAngle = CFrame.Angles, CFrame.fromAxisAngle
CFrame.fromEulerAnglesYXZ = function(x, y, z) return cfmul(cfmul(angles(0, y, 0), angles(x, 0, 0)), angles(0, 0, z)) end

C3MT = {}
isC3 = function(v) return type(v) == "table" and getmetatable(v) == C3MT end
C3MT.__index = function(c, k)
  if k == "R" then return c.r elseif k == "G" then return c.g elseif k == "B" then return c.b
  elseif k == "lerp" or k == "Lerp" then return function(a, b, t) return Color3.new(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t) end
  end
  error(tostring(k) .. " is not a valid member of Color3", 2)
end
C3MT.__eq = function(a, b) return a.r == b.r and a.g == b.g and a.b == b.b end
C3MT.__tostring = function(c) return fnum(c.r) .. ", " .. fnum(c.g) .. ", " .. fnum(c.b) end
Color3 = { new = function(r, g, b) return setmetatable({ r = tonumber(r) or 0, g = tonumber(g) or 0, b = tonumber(b) or 0 }, C3MT) end }
Color3.fromRGB = function(r, g, b) return Color3.new((r or 0) / 255, (g or 0) / 255, (b or 0) / 255) end

BCMT = {}
isBC = function(v) return type(v) == "table" and getmetatable(v) == BCMT end
local brickByName = {}
for n, b in pairs(BRICKS) do
  local k = lower(b.name)
  if not brickByName[k] or n < brickByName[k] then brickByName[k] = n end
end
local function nearest(r, g, b)
  local best, bd = 194, huge
  for n, c in pairs(BRICKS) do
    local d = (c.r - r) ^ 2 + (c.g - g) ^ 2 + (c.b - b) ^ 2
    if d < bd then best, bd = n, d end
  end
  return best
end
local brickCache = {}
local function bcnew(n)
  if not BRICKS[n] then n = 194 end
  local c = brickCache[n]
  if c then return c end
  local b = BRICKS[n]
  c = setmetatable({ Number = n, Name = b.name, r = b.r, g = b.g, b = b.b }, BCMT)
  brickCache[n] = c
  return c
end
BCMT.__index = function(c, k)
  if k == "Color" then return Color3.new(c.r, c.g, c.b) end
  if k == "number" then return c.Number end
  if k == "name" then return c.Name end
  error(tostring(k) .. " is not a valid member of BrickColor", 2)
end
BCMT.__eq = function(a, b) return a.Number == b.Number end
BCMT.__tostring = function(c) return c.Name end
BrickColor = {}
BrickColor.new = function(a, g, b)
  if type(a) == "number" and g ~= nil then return bcnew(nearest(a, g, b)) end
  if type(a) == "number" then return bcnew(floor(a)) end
  if type(a) == "string" then return bcnew(brickByName[lower(a)] or 194) end
  if isC3(a) then return bcnew(nearest(a.r, a.g, a.b)) end
  if isBC(a) then return a end
  return bcnew(194)
end
BrickColor.Random = function() return bcnew(PALETTE[random(1, #PALETTE)]) end
BrickColor.random = BrickColor.Random
BrickColor.palette = function(i) return bcnew(PALETTE[(i or 0) + 1] or 194) end
BrickColor.White = function() return bcnew(1) end
BrickColor.Gray = function() return bcnew(194) end
BrickColor.DarkGray = function() return bcnew(199) end
BrickColor.Black = function() return bcnew(26) end
BrickColor.Red = function() return bcnew(21) end
BrickColor.Yellow = function() return bcnew(24) end
BrickColor.Green = function() return bcnew(28) end
BrickColor.Blue = function() return bcnew(23) end

UDMT = {}
local function udnew(s, o) return setmetatable({ Scale = s or 0, Offset = o or 0 }, UDMT) end
UDMT.__index = function(u, k)
  if k == "scale" then return u.Scale elseif k == "offset" then return u.Offset end
  error(tostring(k) .. " is not a valid member of UDim", 2)
end
UDMT.__add = function(a, b) return udnew(a.Scale + b.Scale, a.Offset + b.Offset) end
UDMT.__sub = function(a, b) return udnew(a.Scale - b.Scale, a.Offset - b.Offset) end
UDMT.__eq = function(a, b) return a.Scale == b.Scale and a.Offset == b.Offset end
UDMT.__tostring = function(u) return fnum(u.Scale) .. ", " .. fnum(u.Offset) end
UDim = { new = function(s, o) return udnew(tonumber(s) or 0, tonumber(o) or 0) end }

UD2MT = {}
isUD2 = function(v) return type(v) == "table" and getmetatable(v) == UD2MT end
local function ud2new(xs, xo, ys, yo) return setmetatable({ X = udnew(xs, xo), Y = udnew(ys, yo) }, UD2MT) end
UD2MT.__index = function(u, k)
  if k == "x" then return u.X elseif k == "y" then return u.Y
  elseif k == "Width" then return u.X elseif k == "Height" then return u.Y
  elseif k == "Lerp" or k == "lerp" then
    return function(a, b, t)
      return ud2new(a.X.Scale + (b.X.Scale - a.X.Scale) * t, a.X.Offset + (b.X.Offset - a.X.Offset) * t, a.Y.Scale + (b.Y.Scale - a.Y.Scale) * t, a.Y.Offset + (b.Y.Offset - a.Y.Offset) * t)
    end
  end
  error(tostring(k) .. " is not a valid member of UDim2", 2)
end
UD2MT.__add = function(a, b) return ud2new(a.X.Scale + b.X.Scale, a.X.Offset + b.X.Offset, a.Y.Scale + b.Y.Scale, a.Y.Offset + b.Y.Offset) end
UD2MT.__sub = function(a, b) return ud2new(a.X.Scale - b.X.Scale, a.X.Offset - b.X.Offset, a.Y.Scale - b.Y.Scale, a.Y.Offset - b.Y.Offset) end
UD2MT.__eq = function(a, b) return a.X == b.X and a.Y == b.Y end
UD2MT.__tostring = function(u) return "{" .. tostring(u.X) .. "}, {" .. tostring(u.Y) .. "}" end
UDim2 = { new = function(xs, xo, ys, yo) return ud2new(tonumber(xs) or 0, tonumber(xo) or 0, tonumber(ys) or 0, tonumber(yo) or 0) end }

RayMT = {}
isRay = function(v) return type(v) == "table" and getmetatable(v) == RayMT end
RayMT.__index = function(r, k)
  if k == "origin" then return r.Origin elseif k == "direction" then return r.Direction
  elseif k == "Unit" or k == "unit" then return Ray.new(r.Origin, r.Direction.Unit)
  elseif k == "ClosestPoint" or k == "closestPoint" then
    return function(self, p)
      local d = self.Direction.Unit
      local t = max(0, (p - self.Origin):Dot(d))
      return self.Origin + d * t
    end
  elseif k == "Distance" or k == "distance" then
    return function(self, p) return (self:ClosestPoint(p) - p).Magnitude end
  end
  error(tostring(k) .. " is not a valid member of Ray", 2)
end
RayMT.__tostring = function(r) return "{" .. tostring(r.Origin) .. "}, {" .. tostring(r.Direction) .. "}" end
Ray = { new = function(o, d) return setmetatable({ Origin = o or vnew(), Direction = d or vnew() }, RayMT) end }

R3MT = {}
R3MT.__index = function(r, k)
  if k == "CFrame" then
    local c = (r.Min + r.Max) / 2
    return cfraw(c.X, c.Y, c.Z, 1, 0, 0, 0, 1, 0, 0, 0, 1)
  elseif k == "Size" then return r.Max - r.Min end
  error(tostring(k) .. " is not a valid member of Region3", 2)
end
Region3 = { new = function(a, b) return setmetatable({ Min = a or vnew(), Max = b or vnew() }, R3MT) end }

EnumItemMT = {}
isEnumItem = function(v) return type(v) == "table" and getmetatable(v) == EnumItemMT end
EnumItemMT.__tostring = function(e) return "Enum." .. e.EnumType .. "." .. e.Name end
EnumItemMT.__index = function(e, k)
  if k == "value" then return rawget(e, "Value") elseif k == "name" then return rawget(e, "Name") end
  error(tostring(k) .. " is not a valid member of EnumItem", 2)
end
EnumItemMT.__eq = function(a, b) return a.EnumType == b.EnumType and a.Value == b.Value end
local EnumMT = {}
EnumMT.__index = function(e, k)
  error(tostring(k) .. " is not a valid EnumItem", 2)
end
EnumMT.__tostring = function(e) return rawget(e, "__name") end
local enumMethods = {
  GetEnumItems = function(self)
    local t = {}
    for _, v in pairs(rawget(self, "__items")) do t[#t + 1] = v end
    sort(t, function(a, b) return a.Value < b.Value end)
    return t
  end,
  FromValue = function(self, v)
    return rawget(self, "__byValue")[v]
  end,
}
Enum = {}
for ename, items in pairs(ENUMDATA) do
  local e = { __name = ename, __items = {}, __byValue = {} }
  for iname, v in pairs(items) do
    local item = setmetatable({ Name = iname, Value = v, EnumType = ename }, EnumItemMT)
    e[iname] = item
    e.__items[iname] = item
    if not e.__byValue[v] then e.__byValue[v] = item end
  end
  e.GetEnumItems = enumMethods.GetEnumItems
  e.FromValue = enumMethods.FromValue
  Enum[ename] = setmetatable(e, EnumMT)
end
setmetatable(Enum, { __index = function(_, k) error(tostring(k) .. " is not a valid Enum", 2) end })

local now = 0
local threads = {}
local sleeping = {}
local joiners = setmetatable({}, { __mode = "k" })
local eventWaiters = {}
local subs = {}
local deferred = {}
local budget = 0
local BUDGET = 300
local scriptOf = setmetatable({}, { __mode = "k" })

local function hook()
  budget = budget + 1
  if budget > BUDGET then
    budget = 0
    error("Script timeout: exhausted allowed execution time", 2)
  end
end

local function newThread(fn)
  local co = co_create(fn)
  dbg_sethook(co, hook, "", 100000)
  return co
end

local reportError

local function resume(co, ...)
  budget = 0
  local res = { co_resume(co, ...) }
  if not res[1] and not joiners[co] then
    reportError(co, res[2])
  end
  if co_status(co) == "dead" then
    local j = joiners[co]
    if j then
      joiners[co] = nil
      resume(j, unpack(res, 1, maxn(res)))
    end
  end
  return res
end

local function schedule(co, t, a, b)
  sleeping[#sleeping + 1] = { co = co, at = now + t, start = now }
end

local function sched_wait(t)
  t = tonumber(t) or 0
  if t < 0.03 then t = 0.03 end
  local co = co_running()
  if not co then error("wait() called outside of a thread", 2) end
  local start = now
  schedule(co, t)
  co_yield()
  return now - start, now
end

local function ypcall(f, ...)
  if type(f) ~= "function" then
    local target = f
    local tt = type(target)
    if tt ~= "table" and tt ~= "userdata" then return false, "attempt to call a " .. tt .. " value" end
    f = function(...) return target(...) end
  end
  local outer = co_running()
  local inner = newThread(f)
  scriptOf[inner] = scriptOf[outer]
  local res = { co_resume(inner, ...) }
  while co_status(inner) == "suspended" do
    joiners[inner] = outer
    res = { co_yield() }
    if co_status(inner) == "dead" then
      return unpack(res, 1, maxn(res))
    end
  end
  return unpack(res, 1, maxn(res))
end

local Signal = {}
Signal.__index = Signal
local ConnMT = {}
ConnMT.__index = ConnMT

local function subKey(id, name) return id .. ":" .. name end
Signal.__box = setmetatable({}, { __mode = "k" })
Signal.__tpl = newproxy(true)
do
  local m = getmetatable(Signal.__tpl)
  m.__index = function(u, k) return Signal.__box[u][k] end
  m.__newindex = function(u, k, v) Signal.__box[u][k] = v end
  m.__tostring = function(u) return tostring(Signal.__box[u]) end
  m.__metatable = "The metatable is locked"
end
Signal.__wrap = function(t)
  local u = newproxy(Signal.__tpl)
  Signal.__box[u] = t
  return u
end

function ConnMT.disconnect(c)
  c = Signal.__box[c] or c
  if not c.connected then return end
  c.connected = false
  local list = subs[c.key]
  if list then
    for i = #list, 1, -1 do
      if list[i] == c then tremove(list, i) end
    end
    if #list == 0 and not eventWaiters[c.key] then
      subs[c.key] = nil
      if c.remote then JS_UNSUB(c.id, c.name) end
    end
  end
end
ConnMT.Disconnect = ConnMT.disconnect
ConnMT.__tostring = function() return "Connection" end

local function makeSignal(id, name, localOnly)
  local key = subKey(id, name)
  local s = signalCache[key]
  if s then return s end
  s = Signal.__wrap(setmetatable({ id = id, name = name, key = key, remote = not localOnly }, Signal))
  signalCache[key] = s
  return s
end

function Signal.connect(s, fn)
  s = Signal.__box[s] or s
  if type(fn) ~= "function" then error("Attempt to connect failed: Passed value is not a function", 2) end
  local list = subs[s.key]
  if not list then
    list = {}
    subs[s.key] = list
    if s.remote and not eventWaiters[s.key] then JS_SUB(s.id, s.name) end
  end
  local c = setmetatable({ fn = fn, key = s.key, id = s.id, name = s.name, remote = s.remote, connected = true, script = scriptOf[co_running() or false] }, ConnMT)
  list[#list + 1] = c
  return Signal.__wrap(c)
end
Signal.Connect = Signal.connect
Signal.connectFirst = Signal.connect
Signal.connectLast = Signal.connect

function Signal.wait(s)
  s = Signal.__box[s] or s
  local co = co_running()
  local w = eventWaiters[s.key]
  if not w then
    w = {}
    eventWaiters[s.key] = w
    if s.remote and not subs[s.key] then JS_SUB(s.id, s.name) end
  end
  w[#w + 1] = co
  return co_yield()
end
Signal.Wait = Signal.wait
Signal.__tostring = function(s) return "Signal " .. s.name end

local function fireLocal(key, ...)
  local list = subs[key]
  if list then
    local snapshot = {}
    for i = 1, #list do snapshot[i] = list[i] end
    for i = 1, #snapshot do
      local c = snapshot[i]
      local sid = c.script and idOf[c.script]
      if c.connected and (not sid or J.running(sid)) then
        local co = newThread(c.fn)
        scriptOf[co] = c.script
        resume(co, ...)
      end
    end
  end
  local w = eventWaiters[key]
  if w then
    eventWaiters[key] = nil
    for i = 1, #w do resume(w[i], ...) end
    if not subs[key] then
      local id, name = string.match(key, "^(-?%d+):(.+)$")
      if id then JS_UNSUB(tonumber(id), name) end
    end
  end
end

local function newLocalSignal(name)
  local key = "L" .. tostring({}) .. ":" .. (name or "Event")
  return Signal.__wrap(setmetatable({ id = 0, name = name or "Event", key = key, remote = false }, Signal))
end

local function call(id, method, ...)
  return decResult(JS_CALL(id, method, unpack(enc(...))), 3)
end

local function methodFor(k)
  local f = methodCache[k]
  if f then return f end
  f = function(self, ...)
    local id = idOf[self]
    if not id then error("Expected ':' not '.' calling member function " .. k, 2) end
    local lm = LuaMethods[k]
    if lm then return lm(self, id, ...) end
    return decResult(JS_CALL(id, k, unpack(enc(...))), 2)
  end
  methodCache[k] = f
  return f
end

LuaMethods.__denied = function(id)
  local lk = LuaMethods.__locked[id]
  if lk == nil then
    lk = call(id, "__robloxLocked") == true
    LuaMethods.__locked[id] = lk
  end
  if not lk then return false end
  return LuaMethods.__gameCaller(4)
end

LuaMethods.__gameThread = function()
  local s = scriptOf[co_running() or false]
  local sid = s and idOf[s]
  if not sid then return false end
  local core = LuaMethods.__coreScript[sid]
  if core == nil then
    core = call(sid, "__coreCode") == true
    LuaMethods.__coreScript[sid] = core
  end
  return not core
end

LuaMethods.__gameCaller = function(level)
  for l = level, level + 6 do
    local ok, e = pcall(getfenv, l)
    if not ok then return LuaMethods.__gameThread() end
    if not LuaMethods.__rtEnvs[e] then
      if LuaMethods.__gameEnv[e] then return true end
      if LuaMethods.__coreEnv[e] then return false end
      return LuaMethods.__gameThread()
    end
  end
  return LuaMethods.__gameThread()
end

local instanceIndex = function(u, k)
  local id = idOf[u]
  if id and id ~= 0 and LuaMethods.__denied(id) then error("The current identity (2) cannot " .. tostring(k) .. " (lacking permission 1)", 2) end
  if type(k) == "number" then k = tostring(k) end
  if type(k) ~= "string" then error("bad key", 2) end
  local r = JS_GET(id, k)
  local tag = r[0]
  if tag == "nil" and k == "LocalPlayer" then
    local s = scriptOf[co_running() or false]
    if s and idOf[s] then
      r = JS_GET(idOf[s], "__ownerPlayer")
      tag = r[0]
    end
  end
  if tag == "m" then return methodFor(r[1] or k)
  elseif tag == "ev" then return makeSignal(id, r[1] or k)
  elseif tag == "err" then error(r[1], 2)
  end
  return (dec1(r, 0))
end

local invokeHandlers = {}
local instanceNewindex = function(u, k, v)
  local id = idOf[u]
  if k == "RobloxLocked" and LuaMethods.__gameCaller(3) then error("The current identity (2) cannot RobloxLocked (lacking permission 4)", 2) end
  if id and id ~= 0 and LuaMethods.__denied(id) then error("The current identity (2) cannot " .. tostring(k) .. " (lacking permission 1)", 2) end
  if type(v) == "function" then
    if k == "OnInvoke" or k == "OnServerInvoke" or k == "OnClientInvoke" then
      invokeHandlers[id] = v
      return
    end
    if k == "ErrorCallback" or k == "ConfirmationCallback" or k == "ProcessReceipt" then
      invokeHandlers[id .. ":" .. k] = v
      return
    end
    error("Unable to assign function to property " .. tostring(k), 2)
  end
  local r = JS_SET(id, k, unpack(enc(v)))
  if r then error(r, 2) end
end

template = newproxy(true)
InstanceMT = getmetatable(template)
InstanceMT.__index = instanceIndex
InstanceMT.__newindex = instanceNewindex
InstanceMT.__tostring = function(u)
  local id = idOf[u]
  if not id then return "Instance" end
  local r = JS_GET(id, "Name")
  return r[1] or "Instance"
end
InstanceMT.__metatable = "The metatable is locked"

LuaMethods.WaitForChild = function(self, id, name, timeout)
  local start = now
  while true do
    local c = call(id, "FindFirstChild", name)
    if c then return c end
    if timeout and now - start >= timeout then return nil end
    local s = makeSignal(id, "ChildAdded")
    if timeout then
      sched_wait(0.1)
    else
      s:wait()
    end
  end
end
LuaMethods.waitForChild = LuaMethods.WaitForChild
LuaMethods.Destroy = function(self, id)
  local s = scriptOf[co_running() or false]
  if s and idOf[s] == id then return call(id, "__DestroySelf") end
  return call(id, "Destroy")
end
LuaMethods.destroy = LuaMethods.Destroy

local centerDialogs = setmetatable({}, { __mode = "k" })
LuaMethods.AddCenterDialog = function(self, id, dialog, dtype, show, hide)
  centerDialogs[dialog or false] = { hide = hide }
  if type(show) == "function" then show() end
end
LuaMethods.RemoveCenterDialog = function(self, id, dialog)
  centerDialogs[dialog or false] = nil
end

local asyncWaiters = {}
local function awaitAsync(token)
  local co = co_running()
  asyncWaiters[token] = co
  return co_yield()
end

local function callAsync(id, method, ...)
  local r = JS_CALL(id, method, unpack(enc(...)))
  if r[0] == "async" then
    local res = awaitAsync(r[1])
    if res[0] == "err" then error(res[1], 3) end
    local out, n = decAll(res, 1)
    return unpack(out, 1, n)
  end
  return decResult(r, 3)
end
for _, m in ipairs({ "LoadAsset", "loadAsset", "GetProductInfo", "AwardBadge", "UserHasBadge", "IsInGroup", "GetRankInGroup", "GetRoleInGroup", "IsFriendsWith", "isFriendsWith", "isInGroup", "PlayerOwnsAsset", "GetCollectibles", "SaveNumber", "LoadNumber", "SaveString", "LoadString", "SaveBoolean", "LoadBoolean", "SaveInstance", "LoadInstance", "WaitForDataReady", "waitForDataReady", "GetFriendsOnline", "LoadCharacter", "loadCharacter", "GetUserIdFromNameAsync", "GetNameFromUserIdAsync", "HttpGet", "PostAsync", "GetAsync" }) do
  LuaMethods[m] = function(self, id, ...) return callAsync(id, m, ...) end
end

LuaMethods.Fire = function(self, id, ...)
  fireLocal(subKey(id, "Event"), ...)
end
LuaMethods.Invoke = function(self, id, ...)
  local f = invokeHandlers[id]
  while not f do
    sched_wait(0.03)
    f = invokeHandlers[id]
  end
  return f(...)
end

local CAS = { actions = {}, buttons = {}, hooked = false }

function CAS.run(fn, ...)
  local co = newThread(fn)
  scriptOf[co] = scriptOf[co_running() or false]
  resume(co, ...)
end

function CAS.key(state, key)
  for actionName, a in pairs(CAS.actions) do
    for _, k in ipairs(a.keys) do
      if k == key then CAS.run(a.fn, actionName, state, nil) end
    end
  end
end

function CAS.hookKeys()
  if CAS.hooked or SIDE ~= "client" then return end
  local players = call(0, "GetService", "Players")
  local lp = players and players.LocalPlayer
  local mouse = lp and lp:GetMouse()
  if not mouse then return end
  CAS.hooked = true
  mouse.KeyDown:connect(function(k) CAS.key(Enum.UserInputState.Begin, string.lower(tostring(k))) end)
  mouse.KeyUp:connect(function(k) CAS.key(Enum.UserInputState.End, string.lower(tostring(k))) end)
end

function CAS.unbind(id, name)
  local a = CAS.actions[name]
  if not a then return end
  CAS.actions[name] = nil
  CAS.buttons[name] = nil
  fireLocal(subKey(id, "BoundActionRemoved"), name, a.info)
end

function CAS.bind(self, id, name, fn, createTouchButton, ...)
  name = tostring(name)
  if type(fn) ~= "function" then error("Argument 2 missing or nil", 3) end
  if CAS.actions[name] then CAS.unbind(id, name) end
  local info = { title = "", image = "", description = "", createTouchButton = createTouchButton and true or false, inputTypes = { ... } }
  local keys = {}
  for i = 1, select("#", ...) do
    local v = select(i, ...)
    if type(v) == "string" and #v > 0 then keys[#keys + 1] = string.lower(v) end
  end
  CAS.actions[name] = { fn = fn, info = info, keys = keys }
  if #keys > 0 then CAS.hookKeys() end
  fireLocal(subKey(id, "BoundActionAdded"), name, info.createTouchButton, info)
end

function CAS.setter(field)
  return function(self, id, name, value)
    local a = CAS.actions[tostring(name)]
    if not a then return end
    a.info[field] = value
    fireLocal(subKey(id, "BoundActionChanged"), tostring(name), field, a.info)
  end
end

LuaMethods.BindAction = CAS.bind
LuaMethods.BindActionToInputTypes = CAS.bind
LuaMethods.UnbindAction = function(self, id, name) CAS.unbind(id, tostring(name)) end
LuaMethods.UnbindAllActions = function(self, id)
  local names = {}
  for n in pairs(CAS.actions) do names[#names + 1] = n end
  for _, n in ipairs(names) do CAS.unbind(id, n) end
end
LuaMethods.GetAllBoundActionInfo = function(self, id)
  local out = {}
  for n, a in pairs(CAS.actions) do out[n] = a.info end
  return out
end
LuaMethods.GetBoundActionInfo = function(self, id, name)
  local a = CAS.actions[tostring(name)]
  return a and a.info or {}
end
LuaMethods.SetTitle = CAS.setter("title")
LuaMethods.SetImage = CAS.setter("image")
LuaMethods.SetDescription = CAS.setter("description")
LuaMethods.SetPosition = CAS.setter("position")
LuaMethods.CallFunction = function(self, id, name, state, inputObject)
  local a = CAS.actions[tostring(name)]
  if a then CAS.run(a.fn, tostring(name), state, inputObject) end
end
LuaMethods.FireActionButtonFoundSignal = function(self, id, name, button)
  CAS.buttons[tostring(name)] = button or false
end
LuaMethods.GetButton = function(self, id, name)
  name = tostring(name)
  if not CAS.actions[name] then return nil end
  CAS.buttons[name] = nil
  fireLocal(subKey(id, "GetActionButtonEvent"), name)
  local start = now
  while CAS.buttons[name] == nil and now - start < 1 do sched_wait(0.03) end
  return CAS.buttons[name] or nil
end

local function scriptEnvFor(scriptProxy, sandbox)
  local env = setmetatable({ script = scriptProxy }, { __index = sandbox })
  return env
end

local sandbox = {}
local SHARED = {}

local function luaPrint(...)
  local t = {}
  for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
  local s = scriptOf[co_running() or false]
  JS_LOG("print", concat(t, " "), s and idOf[s] or 0)
end

reportError = function(co, msg)
  local s = scriptOf[co]
  local tb = dbg_traceback(co, tostring(msg))
  JS_LOG("error", tb, s and idOf[s] or 0)
end

local function luaDelay(t, fn)
  local co = newThread(function()
    sched_wait(t)
    fn(t, now)
  end)
  scriptOf[co] = scriptOf[co_running() or false]
  resume(co)
end

local function luaSpawn(fn)
  local co = newThread(function()
    sched_wait(0)
    fn(0, now)
  end)
  scriptOf[co] = scriptOf[co_running() or false]
  resume(co)
end

for k, cbAt in pairs({ TweenPosition = 6, tweenPosition = 6, TweenSize = 6, tweenSize = 6, TweenSizeAndPosition = 7, tweenSizeAndPosition = 7 }) do
  LuaMethods[k] = function(self, id, ...)
    local a = { ... }
    local cb = a[cbAt]
    a[cbAt] = nil
    local serial = call(id, k, unpack(a, 1, cbAt - 1))
    if not serial then return false end
    if type(cb) == "function" then
      luaSpawn(function()
        local st = call(id, "__TweenState", serial)
        while st == "running" do
          sched_wait(0.03)
          st = call(id, "__TweenState", serial)
        end
        cb(st == "completed" and Enum.TweenStatus.Completed or Enum.TweenStatus.Canceled)
      end)
    end
    return true
  end
end

local game = wrap(0)
local workspace = call(0, "GetService", "Workspace")

local InstanceLib = {}
InstanceLib.new = function(cls, parent)
  if type(cls) ~= "string" then error("Argument 1 missing or nil", 2) end
  local r = JS_NEW(cls, parent and idOf[parent] or nil)
  if type(r) == "string" then error(r, 2) end
  return wrap(r)
end
InstanceLib.Lock = function() end
InstanceLib.Unlock = function() end

local libraries = {}
libraries.RbxUtility = {
  Create = function(cls)
    return function(props)
      local inst = InstanceLib.new(cls)
      local parent
      for k, v in pairs(props) do
        if type(k) == "number" then
          v.Parent = inst
        elseif k == "Parent" then
          parent = v
        else
          inst[k] = v
        end
      end
      if parent then inst.Parent = parent end
      return inst
    end
  end,
  CreateSignal = function()
    local s = newLocalSignal("Signal")
    local obj = {}
    function obj:connect(fn) return s:connect(fn) end
    function obj:wait() return s:wait() end
    function obj:fire(...) fireLocal(s.key, ...) end
    obj.Connect, obj.Wait, obj.Fire = obj.connect, obj.wait, obj.fire
    function obj:disconnect() subs[s.key] = nil end
    return obj
  end,
  EncodeJSON = function() return "{}" end,
  DecodeJSON = function() return {} end,
}
libraries.RbxGui = setmetatable({}, { __index = function() return function() return nil end end })
libraries.RbxStamper = libraries.RbxGui
libraries.RbxGear = libraries.RbxGui

local function luaLoadString(src, name)
  if type(src) ~= "string" then return nil, "string expected" end
  if sub(src, 1, 1) == "\27" then return nil, "binary chunks are not allowed" end
  local f, err = loadstring(src, name)
  if not f then return nil, err end
  local caller = getfenv(2)
  setfenv(f, caller)
  return f
end

local moduleCache = {}
local runModule
local libraryCache = {}
local loadLibrary = function(name)
  name = tostring(name)
  local hit = libraryCache[name]
  if hit ~= nil then return hit end
  local src = call(0, "__librarySource", name)
  if type(src) == "string" and src ~= "" and sub(src, 1, 1) ~= "\27" then
    local f, err = loadstring(src, "=" .. name)
    if not f then error(err, 2) end
    setfenv(f, setmetatable({}, { __index = sandbox }))
    local v = f()
    libraryCache[name] = v
    return v
  end
  return libraries[name]
end

LuaMethods.__getfenv = function(l)
  if l == nil then l = 1 end
  local e
  if type(l) == "number" then
    if l < 0 then error("bad argument #1 to 'getfenv' (level must be non-negative)", 2) end
    e = l == 0 and getfenv(0) or getfenv(l + 1)
  else
    e = getfenv(l)
  end
  if l == 0 or LuaMethods.__rtEnvs[e] then
    local s = scriptOf[co_running() or false]
    local se = s and LuaMethods.__envOf[s]
    if se then return se end
  end
  return e
end

local base = {
  assert = assert, error = error, ipairs = ipairs, next = next, pairs = pairs, pcall = ypcall, ypcall = ypcall,
  xpcall = function(f, h, ...)
    local r = { ypcall(f, ...) }
    if not r[1] then return false, h(r[2]) end
    return unpack(r, 1, maxn(r))
  end,
  select = select, tonumber = tonumber, tostring = tostring, type = type, unpack = unpack, rawequal = rawequal,
  rawget = rawget, rawset = rawset, setmetatable = setmetatable,
  getmetatable = getmetatable, setfenv = setfenv, getfenv = LuaMethods.__getfenv, newproxy = newproxy, gcinfo = gcinfo,
  collectgarbage = collectgarbage, loadstring = luaLoadString, _VERSION = _VERSION,
  coroutine = {
    create = function(f)
      local co = newThread(f)
      scriptOf[co] = scriptOf[co_running() or false]
      return co
    end,
    resume = co_resume, yield = co_yield, status = co_status, running = co_running,
    wrap = function(f)
      local co = newThread(f)
      scriptOf[co] = scriptOf[co_running() or false]
      return function(...)
        local r = { co_resume(co, ...) }
        if not r[1] then error(r[2], 2) end
        return unpack(r, 2, maxn(r))
      end
    end,
  },
  string = string, table = table, math = math, os = os,
  print = luaPrint, warn = function(...)
    local t = {}
    for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
    local s = scriptOf[co_running() or false]
    JS_LOG("warn", concat(t, " "), s and idOf[s] or 0)
  end,
  wait = sched_wait, Wait = sched_wait, delay = luaDelay, Delay = luaDelay, spawn = luaSpawn, Spawn = luaSpawn,
  tick = function() return JS_NOW("tick") end,
  time = function() return now end, elapsedTime = function() return now end, ElapsedTime = function() return now end,
  game = game, Game = game, workspace = workspace, Workspace = workspace,
  Instance = InstanceLib, Vector3 = Vector3, Vector2 = Vector2, CFrame = CFrame, Color3 = Color3, BrickColor = BrickColor,
  UDim2 = UDim2, UDim = UDim, Ray = Ray, Region3 = Region3, Enum = Enum,
  shared = SHARED,
  LoadLibrary = function(name) return loadLibrary(name) end,
  version = function() return "0.48.0.0" end,
  printidentity = function(s) luaPrint((s or "Current identity is") .. " 2") end,
  settings = function()
    if LuaMethods.__gameThread() then error("The current identity (2) cannot settings (lacking permission 1)", 2) end
    return call(0, "__settings")
  end,
  UserSettings = function() return call(0, "__UserSettings") end,
  stats = function() return nil end,
  require = function(m) return runModule(m) end,
}
base._G = SHARED
for k, v in pairs(base) do sandbox[k] = v end

local function compileFor(proxy, src, name)
  if type(src) ~= "string" or src == "" then return nil end
  if sub(src, 1, 1) == "\27" then return nil, "binary chunks are not allowed" end
  local f, err = loadstring(src, "=" .. name)
  if not f then return nil, err end
  local env = scriptEnvFor(proxy, sandbox)
  local pid = idOf[proxy]
  if pid then
    if call(pid, "__coreCode") then LuaMethods.__coreEnv[env] = true else LuaMethods.__gameEnv[env] = true end
  end
  if LuaMethods.__envOf[proxy] == nil then LuaMethods.__envOf[proxy] = env end
  setfenv(f, env)
  return f
end

runModule = function(m)
  if not isInstance(m) then error("Attempted to call require with invalid argument(s).", 2) end
  local id = idOf[m]
  local cached = moduleCache[id]
  if cached then return cached.value end
  local src = call(id, "__source")
  local name = call(id, "GetFullName")
  local f, err = compileFor(m, src or "", name)
  if not f then error(err or "Module code did not return exactly one value", 2) end
  local v = f()
  moduleCache[id] = { value = v }
  return v
end

local runningScripts = {}

local function startScript(id)
  if runningScripts[id] then return end
  local proxy = wrap(id)
  local src = call(id, "__source")
  local name = call(id, "GetFullName")
  local f, err = compileFor(proxy, src or "", name)
  if not f then
    if err then JS_LOG("error", tostring(err), id) end
    return
  end
  runningScripts[id] = true
  local co = newThread(f)
  scriptOf[co] = proxy
  resume(co)
end

local function stopScript(id)
  local proxy = proxyOf[id]
  runningScripts[id] = nil
  if not proxy then return end
  for k, list in pairs(subs) do
    for i = #list, 1, -1 do
      if list[i].script == proxy then
        list[i].connected = false
        tremove(list, i)
      end
    end
    if #list == 0 then
      subs[k] = nil
      local sid, name = string.match(k, "^(-?%d+):(.+)$")
      if sid then JS_UNSUB(tonumber(sid), name) end
    end
  end
  for i = #sleeping, 1, -1 do
    if scriptOf[sleeping[i].co] == proxy then tremove(sleeping, i) end
  end
end

local function pollOnce()
  local a = JS_POLL()
  if a[0] == nil then return false end
  local i = 0
  while a[i] ~= nil do
    local kind = a[i]
    if kind == "ev" then
      local id, name, n = a[i + 1], a[i + 2], a[i + 3]
      i = i + 4
      local args = {}
      for k = 1, n do args[k], i = dec1(a, i) end
      if J.alive(id) then fireLocal(subKey(id, name), unpack(args, 1, n)) end
    elseif kind == "start" then
      startScript(a[i + 1])
      i = i + 2
    elseif kind == "stop" then
      stopScript(a[i + 1])
      i = i + 2
    elseif kind == "async" then
      local token, n = a[i + 1], a[i + 2]
      local res = {}
      for k = 1, n do res[k - 1] = a[i + 2 + k] end
      i = i + 3 + n
      local co = asyncWaiters[token]
      asyncWaiters[token] = nil
      if co then resume(co, res) end
    else
      i = i + 1
    end
  end
  return true
end

local function pollEvents()
  for _ = 1, 8 do
    if not pollOnce() then return end
  end
end

local function step(t)
  now = t
  pollEvents()
  local ready = {}
  local keep = {}
  for i = 1, #sleeping do
    local s = sleeping[i]
    if s.at <= now then ready[#ready + 1] = s else keep[#keep + 1] = s end
  end
  sleeping = keep
  sort(ready, function(a, b) return a.at < b.at end)
  for i = 1, #ready do
    local s = ready[i]
    if co_status(s.co) == "suspended" then resume(s.co, now - s.start, now) end
  end
  pollEvents()
  return #sleeping
end


function CAS.closeNote(f)
  local list = CAS.notes or {}
  for i = #list, 1, -1 do
    if list[i] == f then table.remove(list, i) end
  end
  pcall(function() f:Remove() end)
  for i, g in ipairs(list) do
    pcall(function() g.Position = UDim2.new(1, -236, 1, -84 - (i - 1) * 72) end)
  end
end

LuaMethods.SendNotification = function(self, id, title, text, image, duration, callback)
  if SIDE ~= "client" then return end
  local core = call(0, "GetService", "CoreGui")
  local rg = core and core:FindFirstChild("RobloxGui")
  if not rg then return end
  CAS.notes = CAS.notes or {}
  local f = InstanceLib.new("ImageButton")
  f.Name = "Notification"
  f.Size = UDim2.new(0, 226, 0, 64)
  f.Position = UDim2.new(1, -236, 1, -84 - #CAS.notes * 72)
  f.BackgroundColor3 = Color3.new(0.1, 0.1, 0.1)
  f.BackgroundTransparency = 0.25
  f.BorderSizePixel = 0
  f.AutoButtonColor = false
  f.ZIndex = 9
  local x = 10
  if type(image) == "string" and image ~= "" then
    local im = InstanceLib.new("ImageLabel", f)
    im.Size = UDim2.new(0, 48, 0, 48)
    im.Position = UDim2.new(0, 8, 0, 8)
    im.BackgroundTransparency = 1
    im.Image = image
    im.ZIndex = 10
    x = 64
  end
  local t = InstanceLib.new("TextLabel", f)
  t.BackgroundTransparency = 1
  t.Position = UDim2.new(0, x, 0, 8)
  t.Size = UDim2.new(1, -x - 8, 0, 18)
  t.Font = "ArialBold"
  t.FontSize = "Size14"
  t.TextColor3 = Color3.new(1, 1, 1)
  t.TextXAlignment = "Left"
  t.Text = tostring(title or "")
  t.ZIndex = 10
  local d = InstanceLib.new("TextLabel", f)
  d.BackgroundTransparency = 1
  d.Position = UDim2.new(0, x, 0, 28)
  d.Size = UDim2.new(1, -x - 8, 0, 30)
  d.Font = "Arial"
  d.FontSize = "Size12"
  d.TextColor3 = Color3.new(0.85, 0.85, 0.85)
  d.TextXAlignment = "Left"
  d.TextYAlignment = "Top"
  d.TextWrap = true
  d.Text = tostring(text or "")
  d.ZIndex = 10
  CAS.notes[#CAS.notes + 1] = f
  f.MouseButton1Click:connect(function()
    CAS.closeNote(f)
    if type(callback) == "function" then CAS.run(callback) end
  end)
  f.Parent = rg
  luaDelay(tonumber(duration) or 5, function() CAS.closeNote(f) end)
end

CAS.part1 = function()
  return {
    base = base, sandbox = sandbox, LuaMethods = LuaMethods, ext = LuaMethods.__ext, call = call, callAsync = callAsync,
    wrap = wrap, idOf = idOf, proxyOf = proxyOf, isInstance = isInstance, makeSignal = makeSignal, newLocalSignal = newLocalSignal,
    fireLocal = fireLocal, subKey = subKey, subs = subs, Signal = Signal, newThread = newThread, resume = resume,
    sched_wait = sched_wait, scriptOf = scriptOf, now = function() return now end, InstanceLib = InstanceLib,
  }
end
CAS.part2 = function()
  return {
    invokeHandlers = invokeHandlers, runModule = function(m) return runModule(m) end, moduleCache = moduleCache,
    setRunModule = function(fn) runModule = fn end, compileFor = compileFor, enc = enc, dec1 = dec1, decAll = decAll,
    J = J, JS_CALL = JS_CALL, JS_GET = JS_GET, JS_LOG = JS_LOG, ypcall = ypcall, luaSpawn = luaSpawn, luaDelay = luaDelay,
    game = game, CAS = CAS, SIDE = SIDE, BRICKS = BRICKS, fnum = fnum, isEnumItem = isEnumItem,
    reportError = reportError, co_running = co_running, co_yield = co_yield, co_status = co_status, sleeping = function() return sleeping end,
  }
end
CAS.part3 = function()
  return {
    Vector3 = Vector3, Vector2 = Vector2, CFrame = CFrame, Color3 = Color3, BrickColor = BrickColor, UDim2 = UDim2, UDim = UDim,
    Ray = Ray, Region3 = Region3, Enum = Enum, V3MT = V3MT, V2MT = V2MT, CFMT = CFMT, C3MT = C3MT, BCMT = BCMT,
    UD2MT = UD2MT, UDMT = UDMT, RayMT = RayMT, R3MT = R3MT, EnumItemMT = EnumItemMT, InstanceMT = InstanceMT,
  }
end

return {
  extend = function(src, name)
    local f = assert(loadstring(src, "=" .. (name or "extension")))
    local t = CAS.part1()
    for k, v in pairs(CAS.part2()) do t[k] = v end
    for k, v in pairs(CAS.part3()) do t[k] = v end
    __EXT = f(t)
  end,
  step = step,
  setBudget = function(n) BUDGET = n end,
  fire = function(id, name, ...) fireLocal(subKey(id, name), ...) end,
  wrap = wrap,
}
