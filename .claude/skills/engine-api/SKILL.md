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

Match 2012 behaviour, not modern Roblox: check what the script does with the value.

## 3. Constraints

- `runtime.lua` is at the 200-local limit. Add state to an existing table.
- Server-side `env` lacks browser functions, so every `def` must tolerate a missing `env.*`.
- `memberIndex()` builds the methods table with a dummy host (`dm` and `env` mostly empty), so a `def` must only touch `host.dm` and `env` inside its function body. Studio's autocomplete and Object Browser read that index, so new members appear there automatically.
- No comments in code.

## 4. Verify

```sh
node --check shared/luahost.js shared/classes.js client/world.js
node tools/corescripts.mjs desktop
node tools/corescripts.mjs touch
node tools/touch.mjs
```

All must finish with no `error` lines. Restart the game server if `shared/` changed.
