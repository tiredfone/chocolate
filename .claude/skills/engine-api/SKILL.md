---
name: engine-api
description: Make a Chocolate CoreScript or game script work by implementing the engine behaviour it expects. Use when a script errors with "is not a valid member", "is not a valid EnumItem", a type error from a property set, or when a CoreScript's GUI never appears.
---

# Implement missing engine behaviour

CoreScripts are run unmodified, so every fix is on the engine side.

## 1. Reproduce

```sh
node tools/corescripts.mjs desktop
node tools/corescripts.mjs touch
```

Each prints the `RobloxGui` children, the ControlFrame tree and every script error with its line. A script that never appears in the children list is usually stuck in a `waitForChild` for something the engine should have made: open the script at the line it waits on.

For a 2018 place's own scripts, run the server and client together, from copies of the place files so nothing touches the host's asset storage:

```sh
mkdir -p /tmp/places && cp /var/www/assets/assets/<placeId> /tmp/places/
CHOCOLATE_ASSET_DIR=/tmp/places ALL=1 SECONDS=20 node tools/e2e2018.mjs <placeId>
CHOCOLATE_ASSET_DIR=/tmp/places LUA='print(workspace:FindFirstChild("X"))' node tools/e2e2018.mjs <placeId>
```

Startup only covers part of a game. For scripts driven by touches, deaths or remotes, start `Game` from `server/game.js` in a small Node script, join a player with `game.join`, and play the client's part with `game.message(cid, JSON.stringify(m))`: `char` messages walk the character (in steps no faster than WalkSpeed allows, or the server teleports it back), `hp` lowers its health. The server's teleports to the client arrive inside `rep` messages' `after`. For the client's GUI and rendering, load the play page's markup in headless Chrome against a test game server and a fake `redeem`, launched with `--in-process-gpu --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL.

A declared 2018 method that chocolate does not implement returns nil with a warning ("X is not implemented in this client") instead of an error, so run with all output and search for that line.

Read the failing CoreScript by ID through the configured source (`luaSource(id)` in `server/assets.js`), never through a copy.

## 2. Pick the place to fix it

| Error or symptom | Fix |
| --- | --- |
| `X is not a valid member of Class` for a property | Add it to the class's `props` in `shared/classes.js` with its 2012 default |
| Same, for an event | Add it to `EVENTS` in `shared/luahost.js` |
| Same, for a method | `def('Name', 'Class', fn)` in `buildMethods` in `shared/luahost.js` |
| Method takes a Lua function or returns a Lua table | `LuaMethods` in `shared/runtime.lua` plus `LUA_SIDE`, restricted to its class in `methodName` |
| `X is not a valid EnumItem` | Add the item to `ENUMS` in `shared/classes.js` under its exact 2012 name, spaces included |
| `bad argument #3 ... (token expected, got string)` | The enum property lacks a type: add it to `ENUM_PROPS` or `CLASS_ENUM_PROPS` |
| Script waits forever for a GUI object | The engine made it in 2012: build it in `ClientWorld.buildControlFrame` or nearby in `client/world.js` |
| Needs the browser (camera, fullscreen, leave) | Add a function to `ClientWorld.env()` and a hook in `client/main.js` |
| Button acts through `SetVerb` | Handle the verb in `env().verb` in `client/world.js` |
| `Instance no longer exists` from a `ChildRemoved` or other handler | The instance was evicted from the host's `ghosts`. Find what the client destroys in bulk (`window.__world.dm.ghosts`) and destroy internal instances with `dm.destroy(inst, true)` |
| 2018 method or async method | `def` in `installMethods2018` in `shared/api2018.js`; a yielding one returns a Promise and also needs `LM.<Name>` calling `callAsync` in `shared/runtime2018.lua` plus its class in `LUA_CLASS` |
| A script kicks or crashes the player on purpose (admin and anti-exploit systems) | Read the check it fails and match Roblox's real behaviour: security identity (`__gameCaller`, `__denied`, `settings()`, `loadstring`, `RobloxLocked` in `shared/runtime.lua`), what `typeof`, `getfenv`, `pcall` and `FindService` return, what replicates (`REPLICATED_SERVICES`, `hiddenProp`) and how instance references cross remotes. Never special-case the script |

Match 2012 behaviour, not modern Roblox: check what the script does with the value.

## 3. Constraints

- `runtime.lua` is at the 200-local limit. Add state to an existing table such as `LuaMethods.__*`.
- Lua strings are bytes. Strings that are not valid UTF-8 cross the bridge as `sx` (hex) and live in JavaScript with each bad byte as a lone surrogate (U+DC80 + byte); keep new string paths on `pushString` and `decodeArgs`.
- A destroyed instance is still a valid reference (`ghosts`); do not turn it into nil when it crosses to Lua or the network.
- Server-side `env` lacks browser functions, so every `def` must tolerate a missing `env.*`.
- `memberIndex()` builds the methods table with a dummy host (`dm` and `env` mostly empty), so a `def` must only touch `host.dm` and `env` inside its function body. Studio's autocomplete and Object Browser read that index, so new members appear there automatically.
- No comments in code.

## 4. Verify

```sh
node --check shared/luahost.js shared/classes.js client/world.js
node tools/corescripts.mjs desktop
node tools/corescripts.mjs touch
node tools/touch.mjs
node tools/corescripts2018.mjs desktop
node tools/corescripts2018.mjs touch
node tools/e2e2018.mjs 621
```

All must finish with no `error` lines apart from the known `PerformanceStatsManagerScript` one (`touch.mjs` currently fails on its own stub world lacking `emitMouse`). Restart the game server if `shared/` or `server/` changed.
