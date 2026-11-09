# Chocolate Studio

Chocolate Studio is a place editor that runs in the browser and looks and works like the 2012 Studio. It loads a place file, lets the owner edit it, and saves it back in the 2012 XML format. It runs on desktop browsers, phones and tablets.

Studio does not run scripts. Tools > Test > Play Solo saves the place and opens its play page, so testing happens in the real game.

- [Setup](#setup)
- [Using Studio](#using-studio)
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

Characters look best with `content/fonts/head.mesh`. Desktop client zips of some builds lack it; the matching `canary-*` build has it. Copy it into `content/fonts/` and run `npm run content-index` again.

## Using Studio

### Layout

| Area | What it does |
| --- | --- |
| Menu bar | File, Edit, View, Insert, Format, Tools, Help, with the 2012 shortcuts |
| Standard toolbar | Save, Open, Cut, Copy, Paste, Undo, Redo, Group, Ungroup, Rotate, Tilt, Move Up, Move Down |
| Edit toolbar | Drag, Move on axis, Resize, Lock, Anchor, Fill With Color, Pick Color, Change Material, and the Smooth, Glue, Weld, Studs, Inlets, Universal, Hinge and Motor surface tools |
| Run toolbar | Run (saves and opens the game); Pause and Reset are disabled |
| Camera toolbar | Pan, Tilt, Zoom, Look At Object, Zoom Extents |
| Advanced toolbar | Move, Rotate and Resize Parts with handles, grid snapping (1 stud, 1/5 stud, off), Manual Joints, Toolbox |
| Toolbox | Every object class you can insert, with search |
| Explorer | The place tree. Click to select, Ctrl or Shift to multi-select, drag to reparent, double-click a script to open it, right-click (long press on touch) for the selection menu |
| Properties | The selection's properties, grouped like 2012 (Appearance, Data, Behavior, Part, Surface Inputs, Surface) |
| Output | Save results and errors |

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

### Camera

| Input | Action |
| --- | --- |
| Right drag | Orbit |
| Middle drag | Pan |
| Wheel | Zoom |
| W A S D, Q E | Fly; hold Shift to go faster |
| Arrow keys | Turn and tilt |
| F | Look at the selection |
| One finger (touch) | Orbit, when it starts on empty space or no tool is active |
| Two fingers (touch) | Pan and pinch to zoom |
| Thumbstick (touch) | Fly in the direction you are looking |
| Up and down buttons (touch) | Raise and lower the camera |

### Keyboard shortcuts

Ctrl+S save, Ctrl+Z undo, Ctrl+Y redo, Ctrl+X cut, Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+V paste into, Ctrl+D duplicate, Ctrl+A select all, Ctrl+G group, Ctrl+U ungroup, Ctrl+R rotate, Ctrl+T tilt, Delete or Backspace delete, F look at. Inside the script editor, Tab inserts a tab and Ctrl+S saves the place.

### Files

- File > Save (or Publish to ROBLOX) saves to the site.
- File > Save As downloads the place as an `.rbxl` file in the 2012 XML format.
- File > Save Selection as Model downloads the selection as an `.rbxm` file.
- File > Open loads an `.rbxl`, `.rbxlx`, `.rbxm` or `.rbxmx` file from your device. A place replaces everything after you confirm; a model is inserted into Workspace.
- Insert > Model inserts a model by asset ID through the `asset` endpoint.

### Phones and tablets

The menus fold into the button at the top left, the toolbars scroll sideways, and Explorer, Properties, Toolbox and Output become tabs on a sheet at the bottom; tap the open tab again to close the sheet. Handles take a finger within about 34 pixels. Inputs use 16 pixel text so iOS does not zoom when you type.

## Embedding Studio in a site

Studio is a static page plus two endpoints. The host renders a page like this for a user who may edit the place:

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
    "play": "/play/{id}"
  }
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
| `endpoints.play` | Page opened by Run and Play Solo. Leave it out to disable them |

Never put `key`, `siteUrl` or `assetDir` from `config.local.php` into the page.

## Host endpoints

Both endpoints must check that the logged-in user may edit the place. Studio sends the session cookie with `credentials: 'same-origin'`.

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

1. Reject logged-out users and anyone who does not own the place.
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

### Other endpoints Studio uses

| Endpoint | Used for |
| --- | --- |
| `asset` | Mesh, texture, decal, clothing and sky images, and Insert > Model. Must return raw bytes |
| `play` | Opened in a new tab by Run and Tools > Test > Play Solo, after saving |

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

`writePlace(dm)` returns the 2012 XML place file (`version="4"`). It writes every top-level item that came from the file, plus Workspace, Lighting, StarterGui and StarterPack. `writeModel(dm, list)` writes the given instances and their descendants as a model file; references between them are kept and references outside it become `null`.

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
| `clearstarterpack` | Remove every tool in StarterPack |
| `tool:drag`, `tool:axis`, `tool:resize`, `tool:move`, `tool:rotate`, `tool:size` | Selection and transform tools |
| `tool:lock`, `tool:anchor`, `tool:paint`, `tool:dropper`, `tool:material` | Click tools |
| `tool:surface0` to `tool:surface7` | Smooth, Glue, Weld, Studs, Inlet, Universal, Hinge, Motor |
| `grid:1`, `grid:0.2`, `grid:0` | Grid snapping |
| `cam:panleft`, `cam:panright`, `cam:tiltup`, `cam:tiltdown`, `cam:zoomin`, `cam:zoomout`, `cam:lookat`, `cam:extents` | Camera |
| `view:explorer`, `view:properties`, `view:objects`, `view:output` | Show or hide a pane |
| `run`, `playsolo` | Save and open the play page |
| `joints` | Toggle Manual Joints |
| `fullscreen`, `about` | Full screen and About |

Running the current tool's command again turns the tool off.

## Limitations

- No Lua runs in Studio: no Run in place, command bar or Execute Script.
- No terrain editing, Team Create, Find and Replace or web Toolbox catalog.
- Pause and Reset on the Run toolbar are disabled.
- Very large places (tens of thousands of parts) load and save slowly on phones.
