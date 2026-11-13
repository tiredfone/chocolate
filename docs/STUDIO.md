# Chocolate Studio

Chocolate Studio (version 26.12-preview) is a place editor that runs in the browser and looks and works like the 2012 Studio. It loads a place file, lets the owner and their collaborators edit it, alone or together with Team Create, and saves it back in the 2012 XML format. It runs on desktop browsers, phones and tablets.

Studio does not run scripts itself. In 2018 Studio, Play starts a private test server from the place as it is in Studio, unsaved changes included, and shows the game in a Play Solo tab inside Studio; Stop, or closing the tab, ends it. Only you can join that server, and it never takes public players. Without Team Create, Studio gets a play-test ticket from `studioTestTicket` (the `studioTicket` endpoint with `?purpose=test`, which works even when Team Create is off) and sends the place over the game socket as `{ t: 'playsolo', on: true, xml }`; in Team Create it sends `{ t: 'playsolo', on: true }` and the server uses the session's copy. 2012 Studio's Play Solo saves the place and opens its play page.

- [Setup](#setup)
- [Using Studio](#using-studio)
- [Team Create](#team-create)
- [Embedding Studio in a site](#embedding-studio-in-a-site)
- [Host endpoints](#host-endpoints)
- [Place file API](#place-file-api)
- [Studio JavaScript API](#studio-javascript-api)
- [Command reference](#command-reference)
- [Limitations](#limitations)

## Setup

Studio uses the same `content/` folder as the game (see the README), plus the 2012 Studio icons, which are not in the repository because they belong to Roblox:

```sh
npm run studio-ui -- /path/to/RobloxApp.exe
# or straight from the 2012 client zip
npm run studio-ui -- /path/to/version-xxxx.zip
```

This reads the icons, toolbar strips and Explorer class icons out of the executable's resources and writes them to `studio/ui/`. It needs the `unzip` command when given a zip.

Characters look best with `content/fonts/head.mesh`. Some desktop client zips lack it; other 2012 builds such as `version-final` or the `canary-*` builds have it. Copy it into `content/fonts/` and run `npm run content-index` again.

## Using Studio

### Layout

| Area | What it does |
| --- | --- |
| Menu bar | File, Edit, View, Insert, Format, Tools, Test, Help, with the 2012 shortcuts |
| Standard toolbar | Save, Open, Cut, Copy, Paste, Undo, Redo, Group, Ungroup, Rotate, Tilt, Move Up, Move Down |
| Edit toolbar | Drag, Move on axis, Resize, Lock, Anchor, Fill With Color, Pick Color, Change Material, and the Smooth, Glue, Weld, Studs, Inlets, Universal, Hinge and Motor surface tools |
| Run toolbar | Run (saves and opens the game); Pause and Reset are disabled |
| Camera toolbar | Pan, Tilt, Zoom, Look At Object, Zoom Extents |
| Advanced toolbar | Move, Rotate and Resize Parts with handles, grid snapping (1 stud, 1/5 stud, off), Manual Joints, Toolbox |
| Toolbox | A set list and search box over a grid of thumbnails. Free Models lists the site's public models, My Models your own, and Basic Objects every object class you can insert. Click a model to drop it in front of the camera |
| Explorer | The place tree. Click to select, Ctrl or Shift to multi-select, drag to reparent, double-click a script to open it, right-click (long press on touch) for the selection menu |
| Properties | The selection's properties, grouped like 2012 (Appearance, Data, Behavior, Part, Surface Inputs, Surface) |
| Output | Save results, Team Create notices and errors |
| Team Create | Who is editing now, the place's collaborators and a chat between editors (only in Team Create) |
| Object Browser | A document tab listing every class, its inheritance and its properties, functions and events, with defaults and types. Open it with View > Object Browser or Help > Object Reference |

### Tools

Clicking a part selects its outermost model, as in 2012. Alt+click selects the part itself; on touch, use the Explorer.

| Tool | Use |
| --- | --- |
| Drag | Drag the selection across surfaces. It lands on whatever is under the pointer, snapped to the grid |
| Move on axis / Move Parts | Drag the coloured arrows to move along X, Y or Z |
| Resize / Resize Parts | Drag the dots on a single part's faces; the opposite face stays put |
| Rotate Parts | Drag a ring. 45 degree steps on the 1 stud grid, 15 on the 1/5 grid, free with the grid off |
| Lock, Anchor | Click a part to toggle the property |
| Fill With Color | Pick a BrickColor when choosing the tool, then click parts |
| Pick Color | Click a part to copy its colour into Fill With Color |
| Change Material | Pick a material when choosing the tool, then click parts |
| Surface tools | Click a face of a part to set that face's surface |

Click the active tool's button again to turn it off. With no tool, clicks and touches only move the camera. This is the easiest way to look around on a phone.

The mouse uses the 2012 Studio cursors: the arrow, the grab hand while dragging, `ResizeCursor` for the resize tools, `LockCursor`/`UnlockCursor` and `AnchorCursor`/`UnAnchorCursor` depending on the part under the mouse, `FillCursor`, `DropperCursor`, `MaterialCursor`, and `FlatCursor`, `WeldCursor`, `HingeCursor` and `MotorCursor` for the surface tools.

### Terrain

Terrain > Terrain Tools (2018: the TERRAIN tab, or the Terrain group on HOME) opens the terrain pane. A place's terrain follows its era.

- **2018 smooth terrain** is stored as 4-stud voxels with a material and an occupancy, drawn as a smooth surface with the 2018 client's own terrain atlas (`platform/terrain/diffuse.png`, top, side and bottom tiles per material) and water as a translucent surface. Tools: Generate (map size, hill height, water, caves and seed), Add, Subtract, Paint, Grow, Erode, Smooth, Flatten (to the height where the stroke started) and Clear. Brushes have a size, a strength and a sphere or cube shape, and use the material picked from the 2018 material icons.
- **2012 cell terrain** is 4-stud cells that are solid blocks or wedges (`CellBlock`, `CellOrientation`), coloured and textured per `CellMaterial`, with water cells. Tools: Generate, Add, Remove, Paint, Elevation (raises or lowers the columns under the brush), Crater, Smoother (adds wedges to the edges under the brush) and Clear.

Hold the left mouse button over the world to use a brush; the blue sphere or box shows where it acts. Each stroke is one undo step. Strokes, Generate and Clear are sent to the other Team Create editors as `{ t: 'terr', d }` (the changed 16-voxel chunks, encoded by `TerrainData.encode`), and editors who join later get the terrain with the place. Terrain the command bar or a plugin makes through the Terrain Lua API is saved with the place but is not an undo step and is not sent to other editors.

Terrain is saved in the `Terrain` instance as a `ChocolateTerrain` BinaryString (`shared/terrain.js`), which the game server loads, collides with and sends to players. Roblox's own `SmoothGrid` and `ClusterGridV3` data is kept unchanged in the file but not read.

### Camera

| Input | Action |
| --- | --- |
| Right drag | Look around from where the camera is |
| Middle drag | Pan |
| Wheel | Move toward the point under the cursor; Ctrl+wheel zooms |
| W A S D, Q E | Fly; hold Shift to go faster |
| Arrow keys | Turn and tilt |
| F | Look at the selection |
| One finger (touch) | Orbit, when it starts on empty space or no tool is active |
| Two fingers (touch) | Pan and pinch to zoom |
| Thumbstick (touch) | Fly in the direction you are looking |
| Up and down buttons (touch) | Raise and lower the camera |

### Keyboard shortcuts

Ctrl+S save, Ctrl+Z undo, Ctrl+Y redo, Ctrl+X cut, Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+V paste into, Ctrl+D duplicate, Ctrl+A select all, Ctrl+G group, Ctrl+U ungroup, Ctrl+R rotate, Ctrl+T tilt, Delete or Backspace delete, F look at. Inside the script editor, Tab inserts a tab, Ctrl+Space opens autocomplete and Ctrl+S saves the place.

### Script editor and autocomplete

Scripts open in their own tab with 2012 syntax colours. While you type a name, or right after `.` or `:`, a list of completions opens under the cursor:

| You type | You get |
| --- | --- |
| A partial name | Lua keywords, globals (`game`, `workspace`, `script`, `wait`, `Instance`, `Vector3`, ...) and the locals, functions and loop variables in the script |
| `game.` `workspace.` `script.Parent.` | The children that really exist at that point in the place, then the class's properties and events |
| `x:` | The class's methods, including inherited ones (`FindFirstChild`, `GetService`, `LoadAnimation`, ...) |
| `game:GetService("Players").`, `:FindFirstChild("Name").`, `:WaitForChild("Name").` | Resolved to that service or child |
| `local p = Instance.new("Part")` then `p.` | The members of `Part` |
| `math.` `string.` `table.` `coroutine.` `Vector3.` `CFrame.` `BrickColor.` `UDim2.` | The library or constructor functions |
| `Enum.` `Enum.Material.` | Enum types and their items |
| `Instance.new("` | Every class that can be created |
| `:GetService("` | Every service |
| `:IsA("` `:FindFirstChildOfClass("` | Every class name |
| `:FindFirstChild("` `:WaitForChild("` | The names of the object's children |
| `BrickColor.new("` | BrickColor names |

Up and Down move through the list, Enter or Tab inserts the selection (methods get `()` with the cursor inside), and Escape closes it. Apart from the string arguments above, nothing is suggested inside strings or comments.

Quotes and brackets close themselves: typing `"`, `'`, `(`, `[` or `{` inserts the pair with the cursor inside, or wraps the selected text. Typing the closing character steps over it, and Backspace between an empty pair deletes both. A quote is not paired after a letter or inside a string or comment.

### Files

- File > Save (or Publish to ROBLOX) saves to the site.
- File > Save As downloads the place as an `.rbxl` file in the 2012 XML format.
- File > Save Selection as Model downloads the selection as an `.rbxm` file.
- File > Open loads an `.rbxl`, `.rbxlx`, `.rbxm` or `.rbxmx` file from your device. A place replaces everything after you confirm; a model is inserted into Workspace.
- Insert > Model inserts a model by asset ID through the `asset` endpoint.

### Toolbox

The set list at the top of the Toolbox chooses what it shows:

| Set | Contents |
| --- | --- |
| Free Models | Models anyone may use, newest first, from `studioToolbox` with `set=free` |
| My Models | Your own models, including private ones, from `studioToolbox` with `set=mine` |
| Basic Objects | Every class you can insert, as in Insert > Object |

Type in the search box to filter by name. More loads the next page. Clicking a model loads it through the `asset` endpoint, drops it onto whatever is under the camera's focus and selects it; Undo removes it again.

### Phones and tablets

The menus fold into the button at the top left, the toolbars scroll sideways, and Explorer, Properties, Toolbox, Output and Team Create become tabs on a sheet at the bottom; tap the open tab again to close the sheet. Handles take a finger within about 34 pixels. Inputs use 16 pixel text so iOS does not zoom when you type.

### Command bar, Run Script and plugins

The command bar under the viewport runs Lua against the place (Up and Down recall earlier commands), and Tools > Run Script (2018: Test > Run Script) runs a `.lua` file. Each run's changes become one undo step. Script Analysis compiles every script in the place and lists syntax errors; click one to jump to the line.

Plugins are Roblox plugin models. Install them with Manage Plugins (PLUGINS tab, or Tools > Manage Plugins) by asset ID; they are kept in this browser and load each time Studio opens. They get the usual `plugin` object: `CreateToolbar` and `CreateButton` (buttons appear on the PLUGINS tab, or a plugin toolbar in 2012 Studio), `GetMouse` with `Activate`/`Deactivate` (the mouse gets `Button1Down`, `Button1Up`, `Move`, `Hit`, `Target`, `X` and `Y` from the viewport while the plugin is active), `GetSetting`/`SetSetting`, `CreateDockWidgetPluginGui` (shown as a Studio pane that draws its GUI), `OpenScript`, `Union`/`Negate`/`Separate` and `GetStudioUserId`. `Selection` (`Get`, `Set`, `Add`, `Remove`, `SelectionChanged`) and `ChangeHistoryService` (`SetWaypoint`, `Undo`, `Redo`) are tied to Studio's selection and undo history. The place's own Scripts and LocalScripts never run in Studio.

### Debugging Play Solo

Click a line number in a script to set a breakpoint (red). Press Play: when a Script or LocalScript reaches that line, Studio opens it at the line, the Call Stack and Watch panes show where it stopped, its local variables and your watch expressions (Add Watch, or select an expression first). Step Into, Step Over, Step Out, and Play (which continues) are on the SCRIPT MENU and TEST tabs; Pause stops at the next line any script runs. Only the paused script waits: the rest of the game keeps running. Errors from the game appear in Output; Go To Error opens the script at the line, and with the On All Exceptions or On Unhandled Exceptions break mode Studio does this as soon as the error appears.

### Union, Negate and Separate

MODEL > Union combines the selected parts into one UnionOperation, cutting away any NegateOperations in the selection. Negate turns parts into NegateOperations (shown translucent red); negating one again turns it back. Separate splits a union made in this Studio back into its parts, wherever the union has been moved since. Unions from Roblox place files cannot be separated.

## Team Create

Team Create lets several people edit one place at the same time. It is on whenever the page config has a `studioTicket` endpoint.

### Who can edit

The place's owner can always edit. The owner adds collaborators by username in the Team Create pane (and removes them with the cross next to their name). Collaborators can open Studio for the place, edit it and save it, but cannot change the collaborator list. A place can have up to 50 collaborators; banned users cannot be added and lose access.

### How it works

1. Studio asks `studioTicket` for a ticket and opens the game server's WebSocket with it. The site's `redeem` answers `mode: studio` and the editor's `role`.
2. The server keeps one session per place. The first editor to join makes it load the place file (adding a locked baseplate to an empty place) with `track` on, so nothing in the file is lost.
3. The server sends the whole place to each editor who joins, as lossless XML in which every instance's referent is its Team Create id.
4. Every change an editor makes is turned into an operation by a DataModel observer: a property change, a move (deleting is a move to nil, so undo works), or a new subtree sent as XML. Changes are batched every 66 ms, so a drag sends about 15 updates a second.
5. The server checks each operation, applies it to its copy and sends it to every editor in the order it received them. An editor ignores the echo of its own change when it has changed that property again since, so drags do not jump back. Everyone ends up with the same place, and the same file when they save.
6. Saving still goes through `studioSave` from whichever editor presses Save. The others see "saved the place" in Output and their unsaved mark clears.

Each editor has a colour. Their selection shows as a box in that colour in everyone else's viewport, and their name in that colour in the chat.

### Team Test

Test > Team Test (2018: Test > Team Test) starts a test server from the place as everyone is editing it now, unsaved changes included, and opens it for you. Every editor of the session sees that a Team Test is running and joins it with the same button. Only people who have been in that Team Create session can join; anyone else is turned away, and test servers never take public players or appear in the server list. Exit Game (or Test > End Team Test) shuts the test server down for everyone. It also stops by itself once it has been empty for a while.

Messages: an editor sends `{ t: 'teamtest', on: true | false }`; the server answers everyone with `{ t: 'teamtest', on, job, by }`, and `snap` carries `test: { on, job }` for editors who join later. Players join through the `play` endpoint with `?server=job:<job>`.

The session stays on the server for 10 minutes after the last editor leaves, so a reconnecting editor finds unsaved work. After that, unsaved changes are gone: save before you leave.

If Studio cannot join Team Create, it opens the place from `studioPlace` on its own and says so in Output. If the connection drops while editing, Studio tells you; your later changes stay on your screen only, so save them or reload to rejoin.

### Protocol

Messages are JSON over the game WebSocket. Instance ids (`g`) are `s<n>` for objects the server loaded and `c<connection>_<n>` for objects an editor created; the server rejects ids that do not carry the sender's prefix.

| From | Message | Meaning |
| --- | --- | --- |
| server | `{ t: 'snap', you, prefix, role, users, xml, refs, dirty }` | The place, your connection id and the id prefix to use |
| both | `{ t: 'b', ops: [...] }` | A batch of the operations below |
| both | `{ t: 'p', s, g, n, v }` | Set property `n` of `g` to `v`. References are ids, vectors and CFrames arrays |
| both | `{ t: 'm', s, g, p }` | Move `g` under `p`, or to nil when `p` is null |
| both | `{ t: 'n', s, p, xml, refs }` | New objects under `p`. `refs` maps ids to the referents the objects had in the place file |
| both | `{ t: 'sel', g: [...] }` | The sender's selection |
| both | `{ t: 'chat', m }` | Chat, at most 200 characters |
| client | `{ t: 'saved' }` | The sender saved the place |
| both | `{ t: 'terr', d }` | Terrain chunks changed by a brush, Generate, Clear, undo or redo |
| server | `{ t: 'users', users, joined, left }` | Who is editing |
| server | `{ t: 'nack', s, m }` | An operation was rejected |

Server messages carry `u`, the sender's connection id, and `s`, the sender's sequence number.

## Embedding Studio in a site

Studio is a static page plus a few endpoints. The host renders a page like this for a user who may edit the place:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="/chocolate/studio/studio.css?v=VERSION">
<script type="importmap">{"imports": {
  "three": "/chocolate/client/vendor/three.module.js",
  "@dimforge/rapier3d-compat": "/chocolate/client/vendor/rapier.js",
  "wasmoon-lua5.1": "/chocolate/client/vendor/wasmoon.js",
  "lodash": "/chocolate/client/vendor/lodash.js",
  "/chocolate/studio/main.js": "/chocolate/studio/main.js?v=MTIME",
  "/chocolate/studio/studio.js": "/chocolate/studio/studio.js?v=MTIME"
}}</script>
<script type="application/json" id="chocolate-config">{
  "placeId": 1,
  "placeName": "My Place",
  "csrf": "token for X-CSRF-Token",
  "version": 1,
  "publicPath": "/chocolate",
  "endpoints": {
    "asset": "/asset/?id={id}",
    "studioPlace": "/api/chocolate/studio/place/{id}",
    "studioSave": "/api/chocolate/studio/save/{id}",
    "studioTicket": "/api/chocolate/studio/ticket/{id}",
    "studioCollaborators": "/api/chocolate/studio/collaborators/{id}",
    "studioToolbox": "/api/chocolate/studio/toolbox",
    "play": "/play/{id}"
  },
  "role": "owner"
}</script>
</head>
<body>
<div id="studio"><p id="studio-status">Loading</p></div>
<script type="module" src="/chocolate/studio/main.js?v=MTIME"></script>
</body>
</html>
```

Add an import map entry with a `?v=` version for every `.js` file in `client/`, `shared/` and `studio/` (only two are shown above), and load `main.js` with the same versioned URL. Modules import each other by relative path, so without these entries browsers and service workers keep old copies after an update.

### Page config

| Key | Meaning |
| --- | --- |
| `placeId` | Place being edited; substituted for `{id}` in the endpoints |
| `placeName` | Shown in the title bar and the document tab |
| `csrf` | Sent as `X-CSRF-Token` with saves |
| `version` | Cache-busting version for `content-index.json` |
| `publicPath` | URL path where the chocolate folder is served |
| `endpoints.asset` | Raw asset bytes by ID: textures, meshes, Insert Model |
| `endpoints.studioPlace` | Where to load the place from |
| `endpoints.studioSave` | Where to save it. Leave it out for a read-only Studio; Save is then disabled |
| `endpoints.studioTicket` | Team Create ticket. Leave it out to edit alone |
| `endpoints.studioCollaborators` | Collaborator list for the Team Create pane |
| `endpoints.studioToolbox` | Toolbox models. Leave it out to show only Basic Objects |
| `endpoints.studioSettings` | Game Settings window (`GET` reads, owner `POST` saves name, description, max players, client, gear, avatar type and Team Create). Leave it out to link to `gamePage` instead |
| `endpoints.studioTestTicket` | Play-test ticket for 2018 Play Solo. Leave it out to open the play page instead |
| `endpoints.play` | Page opened by Run and Play Solo. Leave it out to disable them |
| `role` | `owner` or `editor`; informational, the endpoints decide |

Never put `key`, `siteUrl` or `assetDir` from `config.local.php` into the page.

## Host endpoints

Every endpoint must check that the logged-in user may edit the place: its owner or one of its collaborators. Studio sends the session cookie with `credentials: 'same-origin'`, and POSTs carry the page's CSRF token in `X-CSRF-Token`.

### `studioPlace`: load

```
GET /api/chocolate/studio/place/{id}
```

| Response | Meaning |
| --- | --- |
| `200` with the place file (XML or binary) as the body | Studio opens it |
| `200` with an empty body | Studio starts a new place with a locked baseplate |
| `401`, `403` or any other status | Studio shows an error and does not open |

Send `Cache-Control: no-store`. Decompress the file first if the host stores it gzip or zlib compressed.

### `studioSave`: save

```
POST /api/chocolate/studio/save/{id}
Content-Type: application/xml
X-CSRF-Token: <csrf from the page config>

<roblox ... version="4"> ... </roblox>
```

| Response | Meaning |
| --- | --- |
| `200 {"success": true}` | Saved; Studio clears the unsaved mark |
| any status with `{"success": false, "error": "..."}` | Studio shows the error and keeps the changes |

What the host should do, in order:

1. Reject logged-out users and anyone who is not the owner or a collaborator.
2. Check the CSRF token.
3. Limit the body size. Solar uses 64 MB.
4. Check that the body starts with `<roblox` and ends with `</roblox>`.
5. Back up the current file. Solar keeps the last 10 copies in `/var/www/assets/backups/places/{id}/`.
6. Write the new file to a temporary path and rename it over the old one, so a failed write never leaves half a place.
7. Refresh anything derived from the place, such as its thumbnail.

Game servers that are already running keep the version they loaded; new servers load the saved one.

A minimal PHP handler:

```php
<?php
header('Content-Type: application/json');
$userId = current_user_id();
$placeId = (int)$id;
if (!$userId || !user_owns_place($userId, $placeId)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'You do not own this place']);
    exit;
}
$data = file_get_contents('php://input', false, null, 0, 64 * 1024 * 1024 + 1);
if ($data === '' || strlen($data) > 64 * 1024 * 1024 || stripos(ltrim($data), '<roblox') !== 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Not a valid place file']);
    exit;
}
$path = "/path/to/places/$placeId";
if (is_file($path)) copy($path, "/path/to/backups/$placeId-" . date('Ymd-His'));
$tmp = "$path.tmp-" . bin2hex(random_bytes(6));
file_put_contents($tmp, $data);
rename($tmp, $path);
echo json_encode(['success' => true]);
```

### `studioTicket`: join Team Create

```
POST /api/chocolate/studio/ticket/{id}
X-CSRF-Token: <csrf>
```

Returns `{ "success": true, "ticket": "<64 hex>", "ws": "/chocolate/ws", "role": "owner" }`. Store only a hash of the ticket, let it expire after a minute and accept it once. When the game server redeems it through `redeem`, answer `{ ok: true, mode: 'studio', userId, username, placeId, role }`, checking again that the user may still edit. Solar keeps these tickets in `ChocolateStudioTickets`, apart from game tickets, so one kind can never be used as the other.

### `studioCollaborators`: list and change collaborators

```
GET  /api/chocolate/studio/collaborators/{id}
POST /api/chocolate/studio/collaborators/{id}   {"action": "add" | "remove", "username": "Name"}
```

Both return `{ success, role, owner: { id, name }, collaborators: [{ id, name }] }`. Any editor may list; only the owner may POST. Solar stores them in `ChocolateCollaborators (PlaceID, UserID, AddedBy, Added)`.

### `studioToolbox`: models for the Toolbox

```
GET /api/chocolate/studio/toolbox?set=free|mine&q=<search>&page=<n>
```

Returns `{ success, more, items: [{ id, name, creator, thumb }] }`, 30 items a page. `name` is plain text; Studio never inserts it as HTML. `thumb` is an image URL or null.

### Other endpoints Studio uses

| Endpoint | Used for |
| --- | --- |
| `asset` | Mesh, texture, decal, clothing and sky images, Toolbox models and Insert > Model. Must return raw bytes |
| `play` | Opened in a new tab by Run and Test > Play Solo, after saving |

## Place file API

Studio's file handling lives in `shared/` and works the same in Node and the browser, so a host can use it for tools such as importers or validators.

### Reading

```js
import { DataModel } from './shared/instance.js';
import { parsePlace } from './shared/rbxl.js';

const dm = new DataModel('client');
dm.load(parsePlace(bytes), dm.root, { track: true });
```

`parsePlace(input)` accepts a `Uint8Array`, an `ArrayBuffer` or a string, and reads both XML and binary place and model files. It returns plain nodes: `{ cls, ref, props, children }`.

`dm.load(nodes, parent, { track: true })` creates instances under `parent` and returns the new ones. With `track`, each loaded instance keeps what it needs to be written back unchanged:

| Field | Meaning |
| --- | --- |
| `inst.fileRef` | The referent it had in the file |
| `inst.fileProps` | Map of property name to `{ raw, tag }`: the name and XML tag the file used, such as `size` for `Size` |
| `inst.extra` | Properties chocolate does not model, kept as they were. Unknown XML tags are kept verbatim |

### Writing

```js
import { writePlace, writeModel } from './shared/rbxlx.js';

const xml = writePlace(dm);
const model = writeModel(dm, [someModel, somePart]);
```

`writePlace(dm)` returns the 2012 XML place file (`version="4"`). It writes every top-level item that came from the file, plus Workspace, Lighting, StarterGui and StarterPack. `writeModel(dm, list, opts)` writes the given instances and their descendants as a model file; references between them are kept and references outside it become `null`. `opts.refOf(inst)` can return the referent to use for an instance, and `opts.skip(inst)` can leave a descendant out; Team Create uses both.

What gets written for each instance:

- Instances loaded with `track`: the properties the file had, under their original names and tags, plus every property listed in `inst.dirtyProps`.
- New instances (no `fileProps`): every property chocolate knows, under 2012 serialization names (`size`, `shape`, `formFactorRaw`, `Color3uint8`, `size_xml`, and so on).
- Always for parts: `Name`, `CFrame`, `size` and `BrickColor`.
- Never: `Archivable` (unless the file had it), `RobloxLocked` and runtime-only properties.
- Instances with `Archivable` set to false are left out with their descendants, as in 2012.

When you change a loaded instance's property in your own code, add the name to `inst.dirtyProps` (a `Set`) so the new value is saved.

An unchanged place round-trips exactly: parsing the output again gives the same instances and property values.

## Studio JavaScript API

`studio/main.js` exposes the running editor as `window.__studio`, an instance of `Studio` from `studio/studio.js`. It is meant for debugging, automated tests and host-side extensions.

### State

| Property | Meaning |
| --- | --- |
| `dm` | The `DataModel` being edited |
| `selection` | `Set` of selected instances |
| `tool` | Current tool name, or `'none'` |
| `grid` | Snap size in studs: `1`, `0.2` or `0` |
| `dirty` | True when there are unsaved changes |
| `undoStack`, `redoStack` | Recorded actions: `{ name, undo, redo }` |
| `ui` | The menus, toolbars and panes (`studio/ui.js`) |
| `view` | Camera, picking and handles (`studio/view.js`); `view.focus`, `view.yaw`, `view.pitch` and `view.dist` place the camera |
| `team` | The Team Create connection (`studio/teamcreate.js`), or undefined when editing alone: `team.users`, `team.gids.get(id)`, `team.send(message)` |
| `objects` | The Toolbox pane |

### Methods

| Method | Does |
| --- | --- |
| `exec(command)` | Runs a menu or toolbar command; see the reference below |
| `enabled(command)`, `checked(command)` | Whether a command can run and whether it shows as on |
| `select(list)`, `toggleSelect(inst)` | Change the selection |
| `setProp(list, name, value)` | Set a property on several instances as one undoable action |
| `setPositions(list, [x, y, z])` | Move parts to a position as one action |
| `translate(list, [dx, dy, dz])` | Move by an offset as one action |
| `insertObject(className, parent)` | Insert a new object, placed in front of the camera if it is a part |
| `insertAsset(assetId, label)` | Load a model through `asset` and drop it in front of the camera, as the Toolbox does |
| `openObjectBrowser()` | Open the Object Browser tab |
| `remove(list)`, `reparent(list, target)`, `group(list)`, `ungroup(list)` | Edit the tree as undoable actions |
| `copy(list)`, `paste(into)` | Clipboard |
| `record(name, undo, redo)` | Add your own undoable action after you have applied it |
| `openScript(script)` | Open a script in an editor tab |
| `save()` | Save through `studioSave`; resolves to true on success |
| `print(text, kind)` | Write to Output; `kind` is `''`, `'info'`, `'warn'` or `'err'` |

Example, inside the Studio page:

```js
const s = window.__studio;
const ws = s.dm.services.get('Workspace');
s.insertObject('Part');
const part = s.lastSelected;
s.setProp([part], 'BrickColor', 21);
s.setProp([part], 'Anchored', true);
await s.save();
```

## Command reference

Every menu item and toolbar button calls `exec` with one of these.

| Command | Action |
| --- | --- |
| `publish`, `publish2` | Save to the site |
| `saveas` | Download the place |
| `savemodel` | Download the selection as a model |
| `open` | Open a file from the device |
| `undo`, `redo` | Undo and redo |
| `cut`, `copy`, `paste`, `pasteinto`, `duplicate`, `delete` | Clipboard and delete |
| `selectall`, `selectchildren` | Selection |
| `rename` | Rename the selected object |
| `group`, `ungroup` | Group into a Model, or ungroup |
| `rotate`, `tilt` | Turn the selection 90 degrees around Y or X |
| `up`, `down` | Move the selection up or down one plate |
| `lock`, `lockall` | Lock the selection, or unlock every part |
| `insert:object`, `insert:service`, `insert:model` | Insert dialogs |
| `objectbrowser` | Open the Object Browser |
| `clearstarterpack` | Remove every tool in StarterPack |
| `tool:drag`, `tool:axis`, `tool:resize`, `tool:move`, `tool:rotate`, `tool:size` | Selection and transform tools |
| `tool:lock`, `tool:anchor`, `tool:paint`, `tool:dropper`, `tool:material` | Click tools |
| `tool:surface0` to `tool:surface7` | Smooth, Glue, Weld, Studs, Inlet, Universal, Hinge, Motor |
| `grid:1`, `grid:0.2`, `grid:0` | Grid snapping |
| `cam:panleft`, `cam:panright`, `cam:tiltup`, `cam:tiltdown`, `cam:zoomin`, `cam:zoomout`, `cam:lookat`, `cam:extents` | Camera |
| `view:explorer`, `view:properties`, `view:objects`, `view:output` | Show or hide a pane |
| `run`, `playsolo` | Save and open the play page |
| `joints` | Toggle Manual Joints |
| `terrain:editor` | Open the terrain pane |
| `terrain:generate`, `terrain:clear` | Generate terrain from a dialog, or clear all terrain |
| `terrain:add`, `terrain:subtract`, `terrain:paint`, `terrain:grow`, `terrain:erode`, `terrain:smooth`, `terrain:flatten`, `terrain:elevate`, `terrain:crater` | Terrain brushes (the 2012 pane shows Remove, Elevation, Crater and Smoother) |
| `fullscreen`, `about` | Full screen and About |

Running the current tool's command again turns the tool off.

## Limitations

- The place's own scripts never run in Studio itself; Play Solo, Run and Team Test run them on a test server.
- Terrain has no Regions tool (copy, paste and move of terrain regions), and Roblox's own smooth and cell terrain data in imported places is kept but not shown.
- Swimming in terrain water is not simulated: water is drawn but characters walk on the bottom.
- Team Create has no script locking: two people typing in the same script overwrite each other's text, last change wins.
- Autocomplete follows `local` aliases only one simple assignment deep and does not know the types of function results.
- Pause and Reset on the Run toolbar are disabled.
- Very large places (tens of thousands of parts) load and save slowly on phones.
