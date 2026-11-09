# Changelog

## Unreleased

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
