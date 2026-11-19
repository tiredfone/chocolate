---
name: client-rendering
description: Chocolate's browser renderer - three.js scene, Material2012 shading, lighting, shadows, character limbs and faces, decals, MeshParts, camera, 2012 vs 2018 look and frame rate. Use when the owner says "client", "shading", "lighting", "shadows", "colours too bright", "washed out", "render", "graphics", "face", "decal", "limbs", "camera", "fps" or "looks wrong in game".
---

# Client rendering

The browser client draws the DataModel with three.js. No build step; modules load by relative path and the play page versions each with `?v=` (mtime).

## File map

- `client/render.js`: `Renderer`: scene, sun and shadow camera (`setQuality`, `resize`), part visuals (`material`, `buildMeshPart`, `buildDecals`, `faceProjected`, `isHeadMesh`), terrain (`terrainOf`), `frame(dt)`. Era picks `MATERIALS` or `MATERIALS2018`.
- `client/shade2012.js`: `Material2012` (ShaderMaterial), `LIGHTS`, `MATERIALS`, `MATERIALS2018`, `STUDS2018`, `setShadeEra`, `applyLighting(L, sunDir)`, `rawColor`, `texPosAttribute`.
- `client/character2012.js`: `BODY_MESH`, `clothingOf`, `CharacterAtlases` (R6 limb atlases from shirt/pants/skin), `R15_GROUP`, `R15Atlases`.
- `client/camera.js`: `CameraController` (zoom limits, shift lock, first person).
- `client/terrainview.js`, `client/particles2012.js`, `client/bitmapfont.js` (nametags and bubbles), `client/avatarview.js` (avatar editor view).
- `client/main.js`: frame loop with `FRAME_MS`.

## Material2012

It ports the 2012 client's own `shaders/materials`: lighting in gamma space (no linear workflow, no MSAA), a sun lamp with specular, a fill lamp, and ambient.
- `softWhite(v)`: the roll-off that keeps bright surfaces from clipping to flat white; applied to lit colour (see lines near 129, 165, 198 in `shade2012.js`).
- Shadow terminator: `smoothstep(0.0, 0.25, dot(N, lamp0Dir))` multiplies the shadow mask, so faces turned away from the sun are fully tinted and the map is only sampled on lit faces (2012 stencil look).
- `shadowTint` (default 0.7, 0.7, 0.72) is the colour of shadowed areas; `applyLighting` sets it from the place's `ShadowColor`/lighting.
- Studs and inlets pick mip level per pixel from the UV derivative (no moire). 2018 uses the `platform/textures/studs.png` atlas (sections: studs, weld, inlet, universal).

## Characters

- R6 parts use the client's own meshes (`content/fonts/head.mesh` etc.) and limb atlases composited from shirt/pants (`CharacterAtlases`).
- R15 limbs are UV-mapped to composited body atlases: `R15Atlases` draws each group's `R15Composit*Base` mesh in the body colour then clothing on top (`R15_GROUP`).
- Faces are Decals; head decals use `buildDecals` and `faceProjected` so a face follows a head mesh. MeshParts go through `buildMeshPart`.
- Characters: see `character-appearance` for why avatars differ from the site.

## Eras and fps

- 2012 and 2018 differ in sky (`SKY_2012`, `SKY_2018`), materials, studs, nametags and GUI. `world.era` decides.
- Frame loop in `client/main.js`: `FRAME_MS = world.era === 2018 ? 1000/60 : 1000/30`. Keep 2018 at 60 fps; the owner confirmed it and does not want it lowered.
- `setQuality(level)` changes pixel ratio and camera far plane.

## Pitfalls

- Procedural textures are fallbacks only; visuals come from `content/` (`contentUrl`, `contentTexture`). Do not use Three's default linear workflow.
- Do not make shadow-map sampling apply to faces turned from the sun.
- Worn hat and accessory Handles do not cast shadows (`build()` in `render.js`): their shadow fell on the wearer's own head and face and left a bright strip on the side of the face beside the shadowed patch. The face decal (`faceProjected`) copies the head geometry's normals and shadow-samples at the same position, so it is not lit with a wrong normal. Vanilla has no shadows and bakes the face into the head texture, so it cannot show this; needs a browser check.
- Skybox faces arrive flipped from `createImageBitmap`; side faces are drawn upright, top and bottom rotated.
- Batched/transparent parts and `LocalTransparencyModifier` (2018) have their own paths in `render.js`.

## Verify

There is no browser on the server, so shader and visual changes cannot be tested here. Do `node --check` on changed files, run `node tools/corescripts.mjs desktop` for errors, and say plainly that the look needs the owner to check in a browser. Do not claim a shader change works unseen.
