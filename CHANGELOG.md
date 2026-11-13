# Changelog

## 26.12-preview

### 2018 client

- Places can run on a 2018 client (`ClientVersion` 2018): Roblox's 2018 CoreScripts, chat, menus, topbar, touch controls and loading screen, R15 characters with body scale and packages, 2018 studs, sky and nametags, and 2018 security identity rules so admin and anti-exploit scripts such as Adonis work.
- All 2018 services exist with their icons, and StarterPlayer works: `StarterPlayerScripts`, `StarterCharacterScripts`, `StarterCharacter`, `StarterHumanoid` and the player settings.
- Holding Space no longer gives an extra jump, shift lock follows the CameraScript, and the settings menu's Graphics slider, volume and sensitivity work and are remembered.
- A TextButton darkens its background, not its text, when pressed. GUI objects get their own input events.
- Other players use their 2018 animations and nametags instead of the 2012 ones. R6 limbs have no studs or inlets in 2018.
- Wedges are drawn the right way round, skies with odd image sizes load, and a sky that fails to load falls back to the whole default sky.

### Terrain

- 2012 cell terrain and 2018 smooth terrain, with the Terrain Lua API of each era (`SetCell`, `AutowedgeCell`, `CellCenterToWorld` and the rest; `FillBlock`, `FillBall`, `FillRegion`, `ReadVoxels`, `WriteVoxels` and the rest). Smooth terrain uses the 2018 client's terrain textures; water is translucent.
- Characters walk and collide on terrain, it replicates to every player, and it is saved in the place.
- Studio terrain tools: Generate, Add, Subtract, Paint, Grow, Erode, Smooth and Flatten for 2018; Generate, Add, Remove, Paint, Elevation, Crater and Smoother for 2012. Brushes are undoable and sync over Team Create.

### Physics and characters

- Unions collide with their real shape instead of a box, which fixes obbies built from unions.
- Ledges and ladders can be climbed on both clients, and `Touched` fires in the same tick, even for thin parts crossed between updates.
- Players no longer get stuck on each other or climb on top of each other: they block one another with a cylinder, are pushed apart when they overlap, and slide past.
- NPCs moved by the server fire `Running`, `FreeFalling`, `Jumping` and `StateChanged`, so their Animate script leaves the fall pose after landing.
- The R15 idle animation no longer jitters: poses with zero weight are skipped, easing styles are honoured, and animations blend by weight and priority like Roblox.
- Packages carry R6 and R15 parts; R15 characters wear a package's R15 limbs.

### Data and Team Create

- 2012 Data Persistence (`SaveNumber`, `SaveString`, `SaveBoolean`, `SaveInstance` and their `Load*`) is kept per player and place.
- Team Create works for 2018 places, and Team Test starts a private test server from the place as everyone is editing it.

### Studio

- The Explorer has a search bar and a + button on each object to insert a child, every pane and the viewport have right-click menus, and 2018 places show all default 2018 services.
- Every 2018 ribbon action works: Game Settings, Play Solo with a debugger (breakpoints, stepping, call stack, watches), Run, Team Test, Union, Negate and Separate, the command bar, Run Script, plugins with toolbars and dock widgets, the UI Editor, the Network Simulator, auto-saves, Find and Replace, stats, grid, axis and recording.

## 26.11.3-hotfix

### Avatars and meshes

- Hats and gear with modern Roblox asset IDs load: IDs above 2^31 were cut to 32 bits, and `rbxassetid://` links were not recognised.
- Classic `version 1.00` meshes are no longer textured upside down.
- Version 6 meshes load, using only their full-detail level.

### Client

- Camera: the mouse wheel and I/O keys zoom in fixed steps, zooming in tilts the view slightly, the camera follows the root part instead of the head, and looking up or down stops at 80 degrees.
- Shift lock eases the camera over the shoulder instead of snapping.
- Nametags show on every character with a Humanoid, NPCs included, within 60 studs, and hide behind walls. The health bar is thinner and always shown.

### Binary places

- Binary places and models read `UDim` and the newer `Content` properties, and `UDim2` values (GUI sizes and positions) are no longer garbled.

### Studio

- ScreenGuis in StarterGui are drawn over the viewport, unless `ShowDevelopmentGui` is off.
- Undoing a script edit from the viewport now shows in the open script. A script removed from the place makes its editor read-only, so typing can't go into a script that won't be saved.
- Ctrl+S in the script editor saves the place.
- Autocomplete knows the types of event handler parameters (`player` in `PlayerAdded`, `hit` in `Touched` and so on), including handlers connected by name, and follows `.Parent` and `FindFirstChild("ClassName")`.

## 26.11.3

### Physics and vehicles

- Hinge, Motor and SteppingMotor surfaces (and `Rotate`, `RotateP` and `RotateV` joints) are real hinges: the wheels of classic cars turn instead of being welded to the car.
- VehicleSeats drive: W and S set Throttle, A and D set Steer, and the seat turns the wheels hinged to its chassis up to `MaxSpeed`, with `Torque` and `TurnSpeed`. Space gets out.
- Cars no longer sink into the floor or fling at edges: the seated character's collision box was pushing the car.
- NPCs whose rig is made of touching surfaces keep their joints instead of falling apart; Hinge and Motor surfaces join parts that overlap them, as 2012 wheels do.
- Climbing a truss lasts until the feet clear it, then hops, so you can climb onto a ledge a little above the top.
- Characters no longer spawn inside each other, which pushed one through thin floors and killed it.

### Client

- Shift lock: Shift locks the mouse to the centre, turns the camera with the mouse, puts the camera over the right shoulder and turns the character with it.
- The sit pose plays in seats: `Humanoid.Seated` now fires on the player's own character.
- F9 opens a developer console with the client's script output and, for the game's owner and developers, the server's.
- Built-in `rbxasset://sounds/...` sounds play; only sounds with an asset id did.
- Decals on a part's Top face are no longer upside down.
- `redeem` can send member `perks`, which become a `SolarPerks` Configuration on the player; nametags use its name colour.

### Server

- `POST /kick` disconnects a user from every game and Team Create session, for hosts that ban or warn players.

### Studio

- Quotes and brackets close themselves, and typing inside `Instance.new("`, `GetService("`, `IsA("`, `FindFirstChild("` or `BrickColor.new("` suggests class, service, child or colour names.
- Autocomplete lists `Parent` and `ClassName`.
- Right-drag looks around from where the camera is, the wheel moves toward the point under the cursor, and the drag tool lands parts on locked parts.

### Servers, badges and friends

- The 2012 engine's loading screen: the default sky behind a grey panel counting Bricks and Connectors, instead of the newer LoadingScript, which this build did not run (`NewLoadingScreen` is now off).
- Several servers per place: players fill the busiest public server with room, a new one starts when all are full, and each server has its own `game.JobId`. Tickets can ask for a particular server, a private server or a reserved server.
- `GET /status` lists every server with its players and every Team Create session; `POST /shutdown` (with the key) stops one server or all of a place's servers.
- The `presence` endpoint tells the site who is playing or editing in Studio.
- `redeem` can answer `allowGear: false` so players spawn without their equipped gear. Each server reads it when it starts.
- Badges and friends: `BadgeService:AwardBadge` and `UserHasBadge` (awards are announced in chat), `IsLegal` answers true, `Player:IsFriendsWith`, `GetFriendsOnline`, `GetFriendStatus`, and `RequestFriendship`/`RevokeFriendship` from the player list, which fire `FriendStatusChanged` and `FriendRequestEvent`. They go through the host's new `social` endpoint.
- `GuiService:SendNotification`, used by the NotificationScript for friend requests, as a 2012-style notification that runs its callback when tapped.
- `HopperBin:Disable()` and `ToggleSelect()`, and `Hat.AttachmentPos`, `AttachmentForward`, `AttachmentRight` and `AttachmentUp`.
- A tool picked up at the moment the character spawns is held properly: it was in the hand but could not be used.
- Package body parts (`CharacterMesh`) replace the limb mesh with the package's mesh.
- `client/avatarview.js`: a standalone 3D character viewer for a host's avatar editor.
- The client renders at most 30 frames a second.

## 26.11.2

Chocolate now uses date-based versions (year, month, release).

### Studio

- Browser Studio (`studio/`) in the style of the 2012 Studio, usable on desktop and touch devices, with lossless 2012 XML place saving (`shared/rbxlx.js`) and `npm run studio-ui` to extract its icons from `RobloxApp.exe`. Guide and API reference in `docs/STUDIO.md`.
- Team Create: the owner adds collaborators by username, and everyone edits the same place live through a session on the game server, with a Team Create pane for who is editing, the collaborator list and chat, and each editor's selection shown in their colour. Changes are lossless: every editor saves the same file.
- Toolbox with the site's Free Models and your own models as a thumbnail grid with search, plus Basic Objects.
- Script autocomplete for keywords, globals, libraries, locals, enums and the members of whatever `game.`, `workspace.`, `script.Parent.`, `:GetService(...)`, `:FindFirstChild(...)` or `Instance.new(...)` points at in the place.
- Object Browser (View > Object Browser, Help > Object Reference) listing every class with its properties, functions and events.
- Closer to the 2012 look: the Office 2007 blue frame, darker captions, a Test menu, and the 2012 tool cursors.
- New site endpoints `studioTicket`, `studioCollaborators` and `studioToolbox`; collaborators may also load and save.

### Client

- The 2012 mouse cursors (`ArrowFarCursor`, `ArrowCursor`, the `DragCursor` hand over ClickDetectors) and `Mouse.Icon` support. The cursor stays visible while you hold the right mouse button to turn the camera.

### Engine and server

- Every catalog gear tested: each gets its own Mouse per equip (clicks no longer reach tools you put away), `Tool.GripPos/GripForward/GripRight/GripUp` exist and move the held tool, `LinkedSource` scripts run (Ban Hammer), and events no longer reach scripts in removed tools.
- Animation support: `Humanoid:LoadAnimation`, `AnimationTrack` (`Play`, `Stop`, `AdjustSpeed`, `AdjustWeight`, `Length`, `KeyframeReached`, `Stopped`) and `GetPlayingAnimationTracks`, with `KeyframeSequence` assets blended onto the character's joints and replicated between players.
- LocalScript reset tools work: a client's own `Humanoid.Health` drops and `BreakJoints` on its own character reach the server.
- Characters no longer touch parts at the world origin when they spawn, which made kill bricks break them on every respawn and left tools and Reset dead until the next equip.
- A character dies as soon as a script breaks its neck, not at its next rig rebuild.
- The server only sends physics records that changed, instead of every awake part every other tick (about 66 KB per update in busy places).

## 0.1.0

First public release.

### Client

- Runs the 2012 client's CoreScripts unmodified on a Lua 5.1 VM compiled to WebAssembly, including the LoadingScript, StarterScript, hotbar and backpack, health bar, player list, chat and the Settings menu.
- Desktop and touch play. Touch devices use the CoreScripts' own TouchControls and ContextActionTouch, with the iOS app's thumbstick, jump button and leave menu.
- Renders like the 2012 OGRE client: gamma-space lighting with a sun lamp, fill lamp and ambient; studs, inlets, welds, glue and universal surfaces from `surfacesAlpha.png` on every material; the medium-quality material textures with their original transforms; reflectance from the sky; modulative shadows tinted by `Lighting.ShadowColor`; sun and moon sprites; no MSAA.
- Fire, smoke, sparkles, explosions and the ForceField use the client's own OGRE particle systems.
- Tools equip from the hotbar and activate on click or tap.

### Server

- Node game server with one worker thread per place, server-side scripts, Rapier physics and replication of only what each player may see.
- Characters get the client's `Animate`, `Sound` and `Health` scripts, the player's appearance and gear, and a spawn ForceField for the SpawnLocation's `Duration`.

### Movement

- Character controller that steps up small ledges, survives floors spawning across its feet and coincident floors, and waits one second after landing before the next jump.

### Setup

- No Roblox files are included. `npm run content-index` indexes a 2012 client `content/` folder, and `npm run ipa-ui -- <ipa>` builds the touch images from the ROBLOX 2.4.1 iOS app.
