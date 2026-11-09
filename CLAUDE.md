# Chocolate

Browser port of the 2012 client. Read `README.md` for the layout, configuration, endpoint contracts and join flow. This folder is served live, so a saved edit to `client/` or `shared/` reaches players on their next page load.

## Code style

- No comments in JS, Lua, PHP, CSS or HTML. Do not add section headers, inline explanations or docblocks.
- ES modules only. Keep the client free of a build step: browser code imports by relative path or through the import map.

## Rules

- **CoreScripts are run exactly as given.** Never edit a CoreScript, add a client-side alias for one, or skip one. When a CoreScript fails, implement the engine behaviour it expects. The only alias allowed is `CORE_ALIASES` in `client/assets.js`, for IDs the StarterScript references that have no file.
- **Nothing connects to a particular website directly.** Every host URL, path, port, file location and secret comes from `config.php` merged with `config.local.php`. On the server, read it through `server/config.js` (`config`, `endpoint`, `siteUrl`). In the browser, use `endpointUrl` and `publicPath` from `client/assets.js`, which get their values from the page's `#chocolate-config`. Do not hard-code `/api/...`, `/Asset`, `/game/...` or a site domain, and do not read the host site's files or config.
- **Secrets stay server-side.** `key`, `siteUrl` and `assetDir` must never reach the page or a log line. `config.local.php` is gitignored; stage files by name.
- **Visuals come from `content/`.** Use the client's own textures, sky, sprites, 9-slice images and sounds through `contentUrl`, `contentTexture` and `nineSlice`. Procedural textures are only fallbacks for files the content folder lacks. Files the desktop content lacks come from the matching iOS app (ROBLOX 2.4.1 IPA): `client/ui/TouchControlsSheet.png` is its `thumbstickOuter`, `thumbstickInner`, `jumpButtonPress` and `jumpbutton` at the sheet rectangles TouchControls uses, and `client/ui/roblox-logo.png` is its `roblox-logo@2x.png`. IPA PNGs are Apple CgBI files; `tools/ipa-ui.mjs` converts them and builds `client/ui/`. Map such files in `LOCAL_CONTENT`. Neither `content/` nor `client/ui/*.png` is committed: they are Roblox's files.
- **Characters get the client's own scripts.** The server inserts `Animate` and `RobloxTeam` from `content/fonts/humanoidAnimateLocal.rbxm`, `Sound` from `humanoidSound.rbxm` and `Health` from `humanoidHealth.rbxm`, as the 2012 engine did, and fires Humanoid `Running`, `Jumping`, `FreeFalling` and `Climbing` from client state updates. The JS animation in `shared/humanoid.js` only runs for characters whose `Animate` LocalScript is not running locally.
- **Touch mode loads the Settings CoreScript.** The StarterScript skips Settings on touch devices, which left no menu in a browser. The engine adds Settings (46295863) at the moment the StarterScript adds TouchControls and keeps `BottomLeftControl` visible for its button. There is no HTML menu.
- **Engine-built GUI lives in `client/world.js`.** The 2012 engine made `RobloxGui.ControlFrame` and its controls itself; CoreScripts wait for those objects by name. Keep their names and parents. Desktop gets the small camera cluster bottom right and no background plates; touch devices get no camera cluster and the iOS app's Leave button and leave menu (`LeaveMenu*` images from the IPA).
- **CoreScript names are kept exactly.** `AddCoreScript(id, parent, name)` names the script `name` as given, path included; other scripts wait for names such as `CoreScripts/BackpackScripts/BackpackManager`.
- **The GUI has a minimum resolution.** `ClientWorld.guiScale()` makes the CoreScripts see at least 640 units on the short side (the iOS app's 960x640) and the page scales the GUI layer down to fit with CSS `zoom`. Touch coordinates, `Mouse.X/Y` and `GetScreenResolution` use the scaled units. `GuiService:SetGlobalGuiInset` reserves strips (ChatScript uses a 20px bottom strip for its bar).
- **Hint and Message look like the 2012 engine:** a black top bar and a dimmed screen with white bold Arial.
- **Parts render like the 2012 OGRE client.** Every part, mesh, limb and decal uses `Material2012` from `client/shade2012.js`, which ports the client's own `shaders/materials` scripts: lighting in gamma space (no linear workflow, no MSAA), a sun lamp with specular, an opposite fill lamp and `Lighting.Ambient`, and modulative shadows tinted by `Lighting.ShadowColor`. Material textures are the medium-quality `*Fallback` files applied with `add_signed` and each script's texture transform (`MATERIALS`); surfaces come from `textures/surfacesAlpha.png`, alpha-blended over the lit colour on every material. Part geometry needs the `tpos` attribute (`texPosAttribute`). Lighting is clamped before material textures and studs, as D3D9 clamped vertex lighting before its texture stages; otherwise bright places (white `Ambient`) wash them out. A texture whose image arrives after the first frame must be `dispose()`d before `needsUpdate`, because WebGL2 textures keep the size of their first upload (see `contentTexture`). Do not add `MeshPhongMaterial` or other lit three.js materials for world geometry.
- **Studio keeps places lossless.** `studio/` edits a local DataModel loaded with `{ track: true }` and saves through `shared/rbxlx.js`. Never drop `fileProps`, `fileRef` or `extra` from loaded instances, and record every property Studio changes in `dirtyProps` (`Studio.setPropRaw`). Changes go through `Studio.record` so they can be undone. Studio's art comes from `RobloxApp.exe` via `tools/studio-ui.mjs`; `studio/ui/*.png` is not committed. Studio runs no Lua.
- **Characters are built the 2012 way.** R6 limbs use the client's body meshes (`content/fonts/torso.mesh` etc.); clothing is composited into a 1024x512 atlas with the `Composit*.mesh` files in the engine's order (body colours, pants, shirt, T-shirt) by `client/character2012.js`. Studs and inlets on limb tops and bottoms are overlays driven by the part's surfaces, which `buildCharacter` sets from `content/fonts/character.rbxm`.
- **Engine-drawn text uses the client's bitmap fonts.** Nametags (ArialBold-18pt, team colour) and chat bubbles (Arial-18pt on the `chatBubble_white` 9-slice, tail drawn into the same canvas) go through `client/bitmapfont.js`; do not switch them to CSS fonts.
- **Shadows follow 2012's stencil look:** faces turned away from the sun are fully tinted by `ShadowColor`, so the shadow map is only sampled on lit faces.
- **Character movement must survive overlapping geometry.** `Controller` lifts the character out of floors that spawn across its feet (`unstick`) and uses a normal nudge factor so coincident floors (two coplanar baseplates) do not trap it. Re-run `tools/movement.mjs` after changing either.

## Engine API

- Classes, properties and enums: `shared/classes.js`. Enum items keep their 2012 names, including ones with spaces such as `"Mouse Lock Switch"`. Give an enum property its enum type in `ENUM_PROPS`, or in `CLASS_ENUM_PROPS` when the type depends on the class.
- Events: `EVENTS` at the top of `shared/luahost.js`.
- Methods: `def(names, class, fn)` in `buildMethods` in `shared/luahost.js`. Return `null` for nothing, wrap typed values with `T`, and return a Promise for yielding methods listed in `ASYNC`.
- Methods that take Lua functions or tables must run in Lua: add them to `LuaMethods` in `shared/runtime.lua` and to `LUA_SIDE` (restricted to their class in `methodName`). `ContextActionService` is the example.
- `shared/runtime.lua` is at Lua 5.1's limit of 200 top-level locals. Put new top-level state in an existing table such as `CAS`, never in a new `local`.
- Side effects that need the browser go through the `env` object built in `ClientWorld.env()`, which forwards to hooks set in `client/main.js`.

## Lua 5.1 rules for scripts

- `string.split` does not exist; use `string.gmatch`.
- Yielding across `pcall` aborts the thread, so anything that yields, such as `LoadAsset`, must stay outside `pcall`.

## Verifying changes

- `node --check` every changed JS file. For `runtime.lua`, compile it through wasmoon as the tools do.
- Run the matching tool in `tools/` (see `README.md`). A change to the engine API or to `classes.js` needs `node tools/corescripts.mjs desktop` and `touch` to stay free of errors.
- Changes under `server/` or `shared/` take effect on the game server only after it restarts. The play page gives every `client/` and `shared/` module its own `?v=` (file mtime) through the import map, so browsers and the site's service worker pick up a saved change on the next page load. Fetch any other per-build file with `?v=` too.
- Only make read-only requests to the host site while testing. `tools/character.mjs` is read-only.

## Skills

- `engine-api`: make a CoreScript or game script work by adding the engine behaviour it expects.
- `character-appearance`: find out why a player's character, clothing, colours or gear differ from the site.
- `touch-controls`: work on mobile input, TouchControls, ContextActionTouch or the touch-only UI.
