---
name: lua-runtime
description: Chocolate's Lua runtime - wasmoon Lua 5.1, shared/runtime.lua, runtime2018.lua, luahost.js methods, events and flags, and the node test tools. Use when the owner says "Lua", "runtime", "script API", "add a Roblox API", "luahost", "wasmoon", "string.split", "pcall yield", "test tools", "e2e", "movement test" or "touch test".
---

# Lua runtime

Game scripts and CoreScripts run in wasmoon (Lua 5.1 in WebAssembly), on the client and in each server worker. `shared/` is used by both, so changes there need a server restart (see `game-server`).

## File map

- `shared/luahost.js`: bridge. `EVENTS` (top, event names per class), `ASYNC` (methods that return Promises and yield), `LUA_SIDE`, `ENGINE_FLAGS`, `T` (typed value wrappers), `def(names, class, fn)` inside `buildMethods`, `memberIndex()`, byte-string `sx` encoding, `ReportAbuse`, `TextBounds`, `GetFFlag`.
- `shared/runtime.lua`: base sandbox: `LuaMethods`, `CAS` (ContextActionService), `instanceNewindex`, signals. Near Lua 5.1's limit of 200 top-level locals.
- `shared/runtime2018.lua`: 2018 additions (`E` table: `E.input`, receipts signal `__Receipt`, etc.), loaded as `runtime2018` when the era is 2018.
- `shared/classes.js`: classes, properties, enums (`ENUM_PROPS`, `CLASS_ENUM_PROPS`); `classes2018.js` and `api2018.js` come from `tools/api2018.mjs` and the 0.349 dump. `shared/instance.js`: `DataModel`, `setProp`, `setParent`.
- `shared/core2018.js`: 2018 CoreScript modules. `shared/services.js`: default services. `shared/animator.js`, `physics.js`, `humanoid.js`.

## Adding a Roblox API

1. Class/property/enum: `classes.js` (give enum props their type in `ENUM_PROPS` or `CLASS_ENUM_PROPS`).
2. Event: add to `EVENTS` in `luahost.js`.
3. Method: `def('Name', 'Class', (inst, [args]) => ...)`. Return `null` for nothing, wrap typed values with `T`. If it must wait, return a Promise and add the name to `ASYNC`.
4. Methods that take Lua functions or tables run in Lua: add to `LuaMethods` in `runtime.lua` and `LUA_SIDE`.
5. Browser side effects go through `env`, built in `ClientWorld.env()` and forwarded to hooks in `client/main.js`.
6. New top-level state in `runtime.lua` goes in an existing table (`CAS`), never a new `local`.
7. 2018-only members: gated by `host.flags` (`FLAGS_2018`) via `declared2018`.

For the workflow of a missing member or enum reported by a CoreScript, use the `engine-api` skill; it is not repeated here.

## Lua 5.1 constraints

- `string.split` does not exist; use `string.gmatch`.
- Yielding across `pcall` aborts the thread; keep `LoadAsset` and similar outside `pcall`.
- `tostring(f)` on a function is wrapped (wasmoon sets a shared metatable).
- `type()` gives `"userdata"` for engine datatypes in game code (2018).
- Lua strings are bytes; invalid UTF-8 crosses as `sx` hex.
- CoreScripts may assign nil to value properties (ignored); game scripts get Roblox's error.

## Test tools (run as `fone`)

From `/var/www/html/chocolate`:
- `node tools/corescripts.mjs desktop|touch`: 2012 LoadingScript and StarterScript chain; prints the GUI and script errors. Required clean after API or `classes.js` changes.
- `node tools/corescripts2018.mjs desktop|touch`: same for 2018.
- `node tools/server2018.mjs <placeId> [2012|2018]`: server only.
- `node tools/e2e2018.mjs <placeId>`: server and client together. Env: `SECONDS`, `ALL=1`, `DUMP=Service,...`, `CLICKS="sec:Path.Name:Event"`, `FLOW="Path:Event"`, `TEXTS=regex`, `SHIFT=1`.
- `node tools/movement.mjs`: walks and jumps the controller. `node tools/touch.mjs`: simulated touches. `node tools/character.mjs <placeId> <userId> [name]`: read-only appearance check.
- Prefix: `su fone -s /bin/sh -c 'cd /var/www/html/chocolate && node tools/...'`.
- For `runtime.lua`, compile it through wasmoon as the tools do. `node --check` every changed JS file.

## Pitfalls

- A destroyed instance stays resolvable via the host's `ghosts`; internal instances (KeyframeSequences) must be destroyed with `dm.destroy(inst, true)`.
- Only make read-only requests to the host site while testing.
