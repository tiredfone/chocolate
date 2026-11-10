# Chocolate

Version 26.11.2.

Chocolate is a browser port of the 2012 game client. It runs places in the browser with three.js for rendering, Rapier for physics and a Lua 5.1 VM compiled to WebAssembly, and it runs the client's real CoreScripts unmodified. A Node server simulates each place and replicates it to players over a WebSocket.

It works on desktop and on touch devices. Mobile controls come from the CoreScripts' own touch path (TouchControls, ContextActionTouch), not from a separate UI.

It renders like the 2012 OGRE client: the client's own material scripts are ported to WebGL, with gamma-space lighting, studs and other surfaces from `surfacesAlpha.png`, the medium-quality material textures, modulative shadows tinted by `Lighting.ShadowColor`, and the original particle systems for fire, smoke, sparkles, explosions and the ForceField. The mouse uses the 2012 cursors (`ArrowFarCursor`, `ArrowCursor`, the `DragCursor` hand over ClickDetectors, and any `Mouse.Icon` a tool sets), and stays visible while you hold the right button to turn the camera.

It also includes a browser Studio in the style of the 2012 Studio, with Team Create, a Toolbox of the site's models, script autocomplete and an Object Browser.

Chocolate is independent of any one website. Everything it needs from the host site goes through the endpoints in `config.php`, overridden by `config.local.php`.

Chocolate does not include any Roblox files. You supply the 2012 client's `content/` folder and the iOS app's touch images yourself; see Setup.

## Layout

| Path | Contents |
| --- | --- |
| `client/` | Browser client: `main.js` boot, `world.js` client DataModel and engine-built GUI, `render.js`, `shade2012.js` 2012 materials and lighting, `particles2012.js` 2012 particle systems, `gui.js`, `camera.js`, `cursor.js` 2012 mouse cursors, `touch.js`, `assets.js`, `net.js` |
| `client/vendor/` | Bundled three.js, Rapier, wasmoon and the Lua wasm |
| `client/ui/` | Touch images the desktop content lacks, built from the iOS app by `tools/ipa-ui.mjs`. Gitignored |
| `shared/` | Code used by both sides: `instance.js` DataModel, `classes.js` classes and enums, `luahost.js` engine API, `runtime.lua` Lua scheduler and datatypes, `physics.js`, `humanoid.js`, `animator.js` KeyframeSequence animation, `rbxl.js` place parser, `rbxlx.js` place writer, `teamsync.js` Team Create sync |
| `studio/` | Browser Studio: `main.js` boot, `studio.js` commands, selection and undo, `view.js` camera, picking, tools and tool cursors, `panes.js` Explorer, Properties, Toolbox, Output and script editor, `reference.js` class and Lua reference behind autocomplete, `browser.js` Object Browser, `teamcreate.js` Team Create client, `ui.js` 2012 menus, toolbars and docking, `studio.css` |
| `studio/ui/` | 2012 Studio icons extracted from `RobloxApp.exe` by `tools/studio-ui.mjs`. Gitignored |
| `server/` | Game server: `main.js` WebSocket front end, `worker.js` one thread per place, `game.js` simulation, `replicator.js`, `teamcreate.js` Team Create sessions, `assets.js`, `config.js` |
| `content/` | The `content/` folder from the matching 2012 client build (textures, sky, sounds, fonts). Gitignored |
| `tools/` | Headless test harnesses and asset extractors, described under Setup and Testing |
| `docs/` | `STUDIO.md`: the full Studio guide and API reference |
| `config.php` | Defaults. Do not put site values here |
| `config.local.php` | Site values and the shared key. Gitignored |

## Setup

1. Run `npm install`. Node 18 or newer is required.
2. Copy the `content/` folder out of the 2012 client build into `content/`. If its `fonts/` folder has no `head.mesh`, copy it from another 2012 build that has one (for example `version-final` or a `canary-*` build). Every R6 body part then uses the client's own meshes: `head.mesh` for heads (normalised to unit size, so any build's copy works) and `torso.mesh`, `leftarm.mesh`, `rightarm.mesh`, `leftleg.mesh` and `rightleg.mesh` for the body. Without `head.mesh`, heads fall back to a drawn shape. Then run `npm run content-index`. The client looks up content paths case-insensitively through the generated `client/content-index.json`, so run it again whenever `content/` changes.
3. For Studio, extract the 2012 Studio icons: `npm run studio-ui -- /path/to/RobloxApp.exe` (or the 2012 client `.zip`). It writes `studio/ui/`.
4. For touch devices, build the touch images from the ROBLOX 2.4.1 iOS app: `npm run ipa-ui -- /path/to/ROBLOX.ipa`. It needs the `unzip` command, converts Apple's CgBI PNGs and writes `client/ui/`. Without these files the game still runs, but the thumbstick, jump button and leave menu have no art.
5. Create `config.local.php`. It returns an array that is merged over `config.php`; `endpoints` is merged key by key.

   ```php
   <?php
   return [
       'port' => 4201,
       'siteUrl' => 'http://127.0.0.1',
       'key' => 'long random shared secret',
       'assetDir' => '/path/to/asset/files',
       'endpoints' => [
           'gears' => '/User/Gears?id={id}',
       ],
   ];
   ```

6. Proxy `{publicPath}/ws` to the server with WebSocket upgrade. `.htaccess` does this for Apache; keep its port equal to `port`.
7. Start the server with `sh server/start.sh` or `npm start`. It reads the config through `php`, so PHP must be installed. `CHOCOLATE_HOST`, `CHOCOLATE_PORT`, `CHOCOLATE_SITE`, `CHOCOLATE_KEY` and `CHOCOLATE_ASSET_DIR` override the config for one run.

## Configuration

| Key | Meaning |
| --- | --- |
| `host`, `port` | Address the game server listens on |
| `publicPath` | URL path where this folder is served |
| `websocketPath` | WebSocket URL used when the ticket response has none |
| `siteUrl` | Base URL the game server uses for server-side endpoints |
| `key` | Shared secret sent as `X-Chocolate-Key` when redeeming tickets |
| `assetDir` | Optional folder of asset files named by ID, with `{id}.lua` for scripts. When empty, assets come from the endpoints |
| `userAgent` | User agent for server-side requests |

Endpoints use `{id}` as a placeholder. Paths are relative to `siteUrl` on the server and to the page origin in the browser.

| Endpoint | Used by | Contract |
| --- | --- | --- |
| `ticket` | browser | `POST {placeId}` as JSON with the page's CSRF token in `X-CSRF-Token`. Returns `{ success, ticket, ws }` |
| `redeem` | server | `POST ticket=...` with `X-Chocolate-Key`. Returns `{ ok, mode, userId, username, placeId, ... }` and must accept each ticket once. `mode` is `play` for a game ticket (with `membership`, `age`, `dev`) or `studio` for a Team Create ticket (with `role`: `owner` or `editor`). A response without `mode` is treated as `play` |
| `asset` | both | Raw asset bytes by ID |
| `place` | server | Place file by ID, only needed when `assetDir` is empty |
| `coreScript` | both | Lua source by ID. A leading signature line starting with `%` is stripped |
| `appearance` | server | `CharacterAppearance` list: URLs separated by `;`, without gear |
| `bodyColors` | server | BodyColors XML for a user |
| `gears` | server | Equipped gear IDs for a user, any separator. Leave empty to give no gear |
| `gamePage`, `play`, `login` | browser | Pages to send the player to on leaving, teleporting or when logged out |
| `studioPlace`, `studioSave`, `studioTicket`, `studioCollaborators`, `studioToolbox` | browser | Studio; see [docs/STUDIO.md](docs/STUDIO.md) |

## Embedding

The host page provides the import map, the `#chocolate-config` JSON and the DOM the client expects:

```html
<script type="importmap">{"imports":{"three":"/chocolate/client/vendor/three.module.js","@dimforge/rapier3d-compat":"/chocolate/client/vendor/rapier.js","wasmoon-lua5.1":"/chocolate/client/vendor/wasmoon.js","lodash":"/chocolate/client/vendor/lodash.js"}}</script>
<script type="application/json" id="chocolate-config">{"placeId":1,"placeName":"Place","csrf":"...","version":1,"publicPath":"/chocolate","websocketPath":"/chocolate/ws","endpoints":{"ticket":"...","asset":"...","coreScript":"...","gamePage":"...","play":"...","login":"..."}}</script>
<div id="chocolate">
  <canvas id="chocolate-canvas" tabindex="0"></canvas>
  <div id="chocolate-loading" class="ch-overlay ch-boot"><div class="ch-boot-loading">Loading</div><p id="chocolate-status" class="ch-boot-status"></p></div>
  <div id="chocolate-fatal" class="ch-overlay" hidden><h2></h2><p></p></div>
</div>
<script type="module" src="/chocolate/client/main.js"></script>
```

Only pass the browser endpoints listed above. Never send `key`, `siteUrl` or `assetDir` to the page.

Give every module under `client/` and `shared/` a version in the import map, for example `"/chocolate/client/world.js": "/chocolate/client/world.js?v=<mtime>"`, and load `main.js` with the same versioned URL. Modules import each other by relative path, so without these entries browsers and service workers keep serving old copies after an update. Put the same version in `#chocolate-config` as `version`; the client adds it to `runtime.lua` and `content-index.json`.

## Studio

`studio/` is a place editor in the style of the 2012 Studio: the 2012 menus, toolbars, Explorer icons and tool cursors, the Drag, Move, Resize, Rotate, Lock, Anchor, Paint, Material and surface tools with grid snapping, Explorer, Properties, Output, script tabs, undo and redo, and lossless saving in the 2012 XML format. The Toolbox lists the site's free models and your own models with thumbnails, plus Basic Objects. The script editor completes Lua keywords, globals, libraries and the members of whatever an expression points at in the place (`game.Workspace.`, `script.Parent:`). The Object Browser (View > Object Browser or Help > Object Reference) lists every class with its properties, functions and events. It works on phones and tablets with a bottom sheet, a camera thumbstick and a camera-only mode. It runs no scripts; Play Solo saves and opens the game.

Team Create lets the owner and the collaborators they add edit a place together. Each Studio joins a session on the game server, which holds the authoritative copy of the place and passes every change on to the other editors.

The host serves a Studio page and the `studioPlace`, `studioSave`, `studioTicket`, `studioCollaborators` and `studioToolbox` endpoints. See [docs/STUDIO.md](docs/STUDIO.md) for setup, the page and endpoint contracts, Team Create, the place file API (`parsePlace`, `writePlace`, `writeModel`), the `window.__studio` API and every command.

## How a join works

1. The page asks the host for a ticket, then opens the WebSocket with it.
2. The server redeems the ticket with the host and starts a worker for the place if none is running.
3. The worker creates the Player, sets `CharacterAppearance`, loads the character from `appearance` and `bodyColors`, and gives StarterPack tools plus the gear from `gears` on every spawn.
4. The client applies the snapshot, creates the engine-built `RobloxGui.ControlFrame`, then runs the LoadingScript (158948138) and the StarterScript (37801172), which loads the other CoreScripts.

A Studio ticket goes to the same WebSocket. When `redeem` answers `mode: studio`, the server puts the connection in that place's Team Create session instead of a game worker.

## Touch

Touch mode is on when the primary pointer is coarse; `?touch=1` or `?touch=0` on the page forces it. In touch mode `UserInputService.TouchEnabled` is true, so the StarterScript loads TouchControls and ContextActionTouch. `client/touch.js` turns pointer events into `InputObject`s and fires `TouchStarted`, `TouchMoved`, `TouchEnded`, `InputBegan`, `InputChanged`, `InputEnded` and `ProcessedEvent` on UserInputService and on the GUI objects under each finger. A short tap that no GUI used acts as a mouse click in the world.

## Testing

There is no test suite. The tools run real code headlessly and print what happened:

```sh
node tools/corescripts.mjs desktop
node tools/corescripts.mjs touch
node tools/touch.mjs
node tools/character.mjs <placeId> <userId> [name]
node tools/movement.mjs
```

To check the place writer, load a place with `dm.load(parsePlace(bytes), dm.root, { track: true })`, write it with `writePlace(dm)`, parse the result again and compare every instance's properties; nothing should differ.

To check Team Create's sync, load a place into one DataModel, send it to a second with `packPlace` and `unpack` from `shared/teamsync.js`, make changes on one side and apply them to the other with `encodeProp`/`decodeProp` and `packSubtree`/`unpack`, then compare `writePlace` of both; the two files must be identical.

`corescripts.mjs` runs the LoadingScript and StarterScript chain and prints the GUI it built and any script errors. `touch.mjs` drives TouchControls and ContextActionTouch with simulated touches. `movement.mjs` walks and jumps the character controller over seams, plates, bricks and walls and prints where it ended up. `character.mjs` starts a place in-process, joins one player and prints the character and backpack. It makes the same read-only requests a real join makes, except it skips the ticket.

## Licenses

Chocolate is released under the MIT License; see `LICENSE`. three.js, Rapier and wasmoon keep their own licenses in `client/vendor/`. The 2012 client content and the iOS images belong to Roblox Corporation and are not part of this repository.
