# Changelog

## Unreleased

- Every catalog gear tested: each gets its own Mouse per equip (clicks no longer reach tools you put away), `Tool.GripPos/GripForward/GripRight/GripUp` exist and move the held tool, `LinkedSource` scripts run (Ban Hammer), and events no longer reach scripts in removed tools.
- Animation support: `Humanoid:LoadAnimation`, `AnimationTrack` (`Play`, `Stop`, `AdjustSpeed`, `AdjustWeight`, `Length`, `KeyframeReached`, `Stopped`) and `GetPlayingAnimationTracks`, with `KeyframeSequence` assets blended onto the character's joints and replicated between players.
- LocalScript reset tools work: a client's own `Humanoid.Health` drops and `BreakJoints` on its own character reach the server.
- Characters no longer touch parts at the world origin when they spawn, which made kill bricks break them on every respawn and left tools and Reset dead until the next equip.
- A character dies as soon as a script breaks its neck, not at its next rig rebuild.
- The server only sends physics records that changed, instead of every awake part every other tick (about 66 KB per update in busy places).
- Studio guide and API reference in `docs/STUDIO.md`.
- Browser Studio (`studio/`) in the style of the 2012 Studio, usable on desktop and touch devices, with lossless 2012 XML place saving (`shared/rbxlx.js`) and `npm run studio-ui` to extract its icons from `RobloxApp.exe`.

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
