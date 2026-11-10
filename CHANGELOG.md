# Changelog

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
