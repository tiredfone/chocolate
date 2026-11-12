---
name: character-appearance
description: Find out why a Chocolate player's character, clothing, hats, body colours or gear differ from what the host site shows. Use for wrong or default avatars, missing hats or gear, or untextured clothing in Chocolate.
---

# Debug character appearance

The game server builds the character the way the 2012 gameserver script does: `CharacterAppearance` from the `appearance` endpoint (gear-free), body colours from `bodyColors`, then StarterPack tools and the gear from `gears` on every spawn.

## 1. Build the character headlessly

```sh
node tools/character.mjs <placeId> <userId> [name]
```

It prints the character tree with `BodyColors`, `Shirt`/`Pants` templates, hats and their meshes, plus the backpack. If the user ID is unknown, the game server log line `[place N] name (id) connected` shows it.

## 2. Compare with the host

Fetch the configured endpoints for that user (read-only). The paths are in `config.local.php`:

- `appearance`: the `;`-separated list. Every non-BodyColors URL must have an `id=`.
- `bodyColors`: XML with six BrickColor numbers.
- `gears`: equipped gear IDs. If this endpoint is empty in the config, nobody gets gear.

If the host's own avatar comes from different data, fix the host or the endpoint config, not Chocolate.

## 3. Find the stage that loses data

| Symptom in the tool output | Look at |
| --- | --- |
| Missing items or colours | `appearance()` in `server/assets.js` and the endpoint responses |
| An item listed but not on the character | `assetNodes(id)`: the asset file must be a `<roblox` model; check `assetDir` or the `asset` endpoint |
| Gear missing from the backpack | `gearFor()` in `server/game.js`; the gear asset must contain a Tool or HopperBin |
| Correct in the tool but wrong in the browser | Client rendering: `clothingTexture` and `buildDecals` in `client/render.js`, and the browser's requests to the `asset` endpoint |

When printing parsed nodes, note that `props` is a `Map`: `JSON.stringify` shows it as `{}`. Print `[...node.props]`.

## 4. Verify

Re-run `tools/character.mjs`, restart the game server, and rejoin. Requests in this workflow must stay read-only.

## Thumbnails in the GUI

Player pictures in CoreScript GUIs (the 2018 menu's player rows, the player list) are not rendered by Chocolate. `Players:GetUserThumbnailAsync` returns the host's `thumbnail` (headshot) or `avatarThumbnail` URL, and `thumbnailSrc` in `client/gui.js` loads those and redirects Roblox thumbnail URLs to them. A blank picture means the host image endpoint failed: request it directly, for example `curl -H 'Host: <site>' 'http://127.0.0.1/image/headshot?userId=<id>'`.
