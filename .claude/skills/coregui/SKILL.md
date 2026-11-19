---
name: coregui
description: Chocolate's CoreGui and CoreScripts - the Roblox scripts that draw the player list, chat, menu/settings, backpack, health bar, purchase prompts and notifications. Use when the owner says "CoreGui", "core scripts", "CoreScripts", "player list", "chat", "menu", "settings menu", "backpack", "leaderboard", "report", "record", "badge in the player list" or "chat colours", or when a GUI is missing, misplaced or has wrong text layout.
---

# CoreGui and CoreScripts

The CoreGui is Roblox's own GUI Lua (player list, chat, Settings menu, backpack, health, purchase prompt, notifications). Chocolate runs those scripts unmodified; the engine has to behave the way they expect.

## Rules

- Never edit, alias, skip or hand-write a CoreScript. Fix the engine (see `engine-api`). The only alias is `CORE_ALIASES` in `client/assets.js` (`53878057 -> 53878058`).
- Names passed to `AddCoreScript(id, parent, name)` are kept exactly, path included; other scripts wait for them.
- If a CoreScript on the host site really must change (SolarPerks edits), back it up first under `/var/www/assets/backups/` (existing folders there: `corescripts-*`, `badges-*`). Prefer an engine fix.

## File map

- `client/assets.js`: `fetchCoreSource(id)` fetches Lua through the `coreScript` endpoint, strips a BOM and a `%` signature line, rejects HTML; `loadCoreSources(rootIds)` follows `AddCoreScript(`, `AddStarterScript(` and `RegisterLibrary(` ids up to 4 levels deep.
- `config.php`: `coreScript` endpoint is `/asset/?id={id}`; the site also has `GET /api/chocolate/corescript/{id}` (`router/api/chocolate/corescript.php`), which serves `/var/www/assets/assets/{id}.lua`.
- `client/world.js`: `STARTER_SCRIPT = 37801172` (root of the 2012 chain), `SETTINGS_SCRIPT = 46295863`, `addCoreScript`, `guiScale()`, engine-built `RobloxGui` and `ControlFrame`, `buildLeaveMenu` (touch), the `RecordToggle` verb.
- `client/gui.js`: draws every GuiObject as DOM; `layout`, `textBounds`, `measureText`, `styleText`, `guiInput`, `detachedAbs`, nametags and billboards.
- `corescripts2018/bundle.json` (+ `CoreScriptsRoot`, `PlayerScripts`): Roblox's 2018 CoreScripts, rebuilt with `node tools/core2018-bundle.mjs`; `shared/core2018.js` builds `RobloxGui.Modules`.
- `shared/runtime2018.lua`: 2018 engine glue the CoreScripts need.
- `server/game.js` (about line 725): creates the `SolarPerks` Configuration on each Player.
- `client/recorder.js`: `GameRecorder` (F12 and the menu Record button).
- `tools/corescripts.mjs`, `tools/corescripts2018.mjs`: run the chain headless.

## How it loads

2012: `loadCoreSources([STARTER_SCRIPT])` downloads the script tree from the host. The StarterScript then calls `AddCoreScript`, which creates a `CoreScript` instance with the downloaded Source. Known IDs on the site (files in `/var/www/assets/assets/`): player list 48488235 and 48488236, chat 97188756 and 97188757, StarterScript 37801172, Settings 46295863. A missing ID logs `CoreScript N (name) is not available` as a warning.

Touch mode: the engine adds Settings (46295863) when the StarterScript adds TouchControls, because the StarterScript skips it on touch (`touchSettings`). See `touch-controls`.

2018: no download. `load2018` in `client/world.js` fetches `corescripts2018/bundle.json`; the real Roblox 2018 scripts run, with flags from `FLAGS_2018` (`shared/api2018.js`).

## 2012 vs 2018

- 2012: ControlFrame, leaderboard and chat are the old scripts; engine draws a 2012 chat bubble and nametag (bitmap fonts).
- 2018: topbar, new menu, Record and Report pages, bubble chat made by `BubbleChat` BillboardGuis, Source Sans text, global GUI inset (36 after the LoadingScript runs).
- The server's `era` in `init` decides the client era, not the page.

## SolarPerks

`redeem` returns `perks` (`badge` as `/asset/?id=N`, `chatColor`, `nameColor` as `#rrggbb`). `server/game.js` validates and adds Configuration `SolarPerks` to the Player with `Badge` (StringValue), `ChatColor` and `NameColor` (Color3Value). Solar's edited ChatScripts (97188756, 97188757) read it to colour message and name; the edited PlayerListScripts (48488235, 48488236) show the badge instead of the Builders Club icon. Those are the only CoreScripts changed, and they live on the host, not here.

## GUI drawing and text

- `ClientWorld.guiScale()` makes CoreScripts see at least 640 units on the short side; the page scales the layer with CSS `zoom`. Touch coordinates, `Mouse.X/Y` and `GetScreen...` account for it.
- `Gui.textBounds` computes `TextBounds` (wrapping, `LineHeight`, font size, 2018 vs 2012 line heights). Wrong layout in the player list or chat is usually here or in `measureText`.
- A TextBox is a native input; children live in a sibling `node.kids` div.
- Detached GUI (no LayerCollector) reports offset-only `AbsoluteSize`.

## Menu, report, record

- Menu: 2012 Settings CoreScript (46295863) and the 2018 Settings modules; Leave and Reset go through engine events.
- Report: `Players:ReportAbuse` (`shared/luahost.js`) -> server `case 'report'` in `server/game.js` -> host `report` endpoint with the last 25 public chat lines. Host stores it in `ChocolateReports`.
- Record: `RecordToggle` verb or F12 starts `GameRecorder`; the clip can be uploaded to Streamable from the dialog.

## Pitfalls

- A GUI that never appears usually means a missing member or enum: use `engine-api`.
- Chat colours not showing: check that `perks` is in the redeem answer and the hosted ChatScripts are the edited versions.
- Do not change `ControlFrame` child names or parents.

## Verify

`node tools/corescripts.mjs desktop` and `touch`, `node tools/corescripts2018.mjs desktop|touch`: no script errors, expected GUI listed. Run as `fone`. For chat end to end: `node tools/e2e2018.mjs <placeId>`. No browser on the server, so layout and visual checks need the owner.
