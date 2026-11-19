---
name: studio
description: Chocolate's browser Studio - the /studio/{id} page, saving and loading places, backups, Team Create, collaborators, the Toolbox, terrain editing, the UI editor, CSG and the 2018 ribbon. Use when the owner says "Studio", "browser Studio", "team create", "collaborators", "toolbox", "save", "terrain tool", "UI editor", "Play Solo" or "edit in Studio".
---

# Browser Studio

A Studio that runs in the browser on a local `DataModel`, for a place's owner and the collaborators they add. It is part of Chocolate (`studio/`) served by the Solar page `/studio/{id}`.

## File map

- `router/frontend/games/studio.php` (in the site root `/var/www/html`): the page; checks `chocolate_studio_role()`, prints the config, import map and `?v=` module versions. Route in `routes/pages.php`.
- `router/api/chocolate/studio-access.php`: `chocolate_studio_role()` (owner, editor, null) used by every endpoint.
- `studio-place.php`: GET place file. `studio-save.php`: POST save, copies the old file to `/var/www/assets/backups/places/{id}/` (last 10) then replaces the place. `studio-ticket.php`: Team Create ticket. `studio-collaborators.php`: list/add/remove. `studio-toolbox.php`: Toolbox list. `studio-settings.php`: place settings. Routes in `routes/api.php` under `/api/chocolate/studio/`.
- `studio/main.js`: boots; loads place via `endpointUrl('studioPlace')`, joins Team Create when `studioTicket` exists.
- `studio/studio.js`: the `Studio` class: menus, save (`writePlace`), `refreshCsrf`, Play Solo.
- `studio/ui.js` (2012 look), `studio/ui2018.js` + `studio/ui2018/` (2018 ribbon), `studio/ui/` (icons from `tools/studio-ui.mjs`).
- `studio/view.js`, `panes.js`, `browser.js`, `reference.js`: viewport, Explorer/Properties panes, Object Browser, autocomplete.
- `studio/terrain.js`: terrain tools. `studio/csgops.js`: Union/Negate/Separate. `studio/lua.js`, `debug.js`: script editor and debugger.
- `studio/extras.js`: 2018 extras (auto-saves in IndexedDB, Find/Replace, Show Grid, stats overlays, recording, Play Solo emulator, UI editor).
- `studio/teamcreate.js` (client) and `server/teamcreate.js` (server): Team Create sync. `shared/teamsync.js`: pack/unpack.
- `shared/rbxlx.js`: lossless place writer.

## How it works

- Load: `/api/chocolate/studio/place/{id}`; `dm.load(parsePlace(bytes), ..., { track: true })`.
- Save: `writePlace(dm)` XML `POST /api/chocolate/studio/save/{id}` with `X-CSRF-Token`, 64 MB limit. Running game servers keep the version they loaded. Never drop `fileProps`, `fileRef` or `extra`; record changed properties in `dirtyProps`.
- CSRF: on a 403 `save` calls `refreshCsrf()` (the `csrf` endpoint), stores the new token in `cfg.csrf`, and retries once. A 401 shows "You were logged out".
- Team Create: `POST /studio/ticket/{id}` gives a one-minute ticket (hashed in `ChocolateStudioTickets`); the client opens the websocket (`ticketWs`), `redeem` answers `mode: studio` with the role. Edits sync as operations from DataModel observers, so a new feature syncs if it changes things through `dm.setProp` and `dm.setParent`. Collaborators are editors only while the game's Team Create setting is on (`ChocolateCollaborators`, at most 50, owner manages).
- Toolbox: `GET /api/chocolate/studio/toolbox?set=free|mine&q=&page=`.
- Terrain: saved as a `ChocolateTerrain` BinaryString on the Terrain instance (`shared/terrain.js`); 2012 cell terrain, 2018 smooth. Menu `Terrain` in 2012 (`terrain:` actions in `ui.js`), TERRAIN tab in 2018.
- UI editor (`studio/extras.js`): click StarterGui objects in the viewport, drag to move, drag handles to resize; `snapAxis` snaps to parent/sibling edges and draws `st-uiguide` lines; Shift snaps values (10 px, 0.01 scale); double click edits text through an overlay textarea whose key events are stopped from reaching Studio.

## Pitfalls

- Studio changes via `dm.setProp` only; setting `props` directly does not sync or save.
- Studio instrumented scripts (`instrument` in `shared/debugger.js`) only for Play Solo.
- Changes under `shared/` and `server/` need a server restart (see `game-server`); `studio/` and `client/` do not.
- Team Create is blocked for non-owners when the game setting is off; the page omits `studioTicket` then.

## Verify

`node --check` changed files. Round-trip a place: load, `writePlace`, parse and compare properties. Team Create: `packPlace`/`unpack` between two DataModels. Tools: `tools/studio-ui.mjs`, `tools/studio2018-ui.mjs` build icons. No browser here; UI checks need the owner. Do not hit the save endpoint (it writes to `/var/www/assets`).
