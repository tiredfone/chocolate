---
name: touch-controls
description: Work on Chocolate's mobile support - TouchControls, ContextActionTouch, touch input events, the thumbstick, jump, camera drag and pinch, tap-to-click, or the touch-only menu. Use when something behaves wrongly on a phone or tablet.
---

# Touch controls

Mobile support is the CoreScripts' own touch path. The StarterScript checks `UserInputService.TouchEnabled` and then loads TouchControls (153556783) and ContextActionTouch (152908679) instead of ToolTip and Settings. Chocolate supplies the engine side.

## Pipeline

1. `detectTouch()` in `client/touch.js` decides touch mode; `?touch=1` forces it on desktop for testing.
2. `ClientWorld.init` sets `TouchEnabled`, `MouseEnabled` and `KeyboardEnabled` before any script runs.
3. `TouchInput` makes one `InputObject` per finger (`UserInputType` Touch, `UserInputState` Begin, Change, End, `Position`, `Delta`) and fires, in order:
   - UserInputService `TouchStarted`, `InputBegan`, then `InputBegan` on every visible GUI object under the finger, topmost first, then `ProcessedEvent`.
   - On move: `TouchMoved`, `InputChanged`, and `InputChanged` on objects under the finger plus every object that got `InputBegan` for it.
   - On release: `TouchEnded`, `InputEnded`, and `InputEnded` on the same set.
4. The scripts call back through engine methods: `Player:MoveCharacter`, `Player:JumpCharacter`, `UserInputService:RotateCamera`, `UserInputService:ZoomCamera`, `ContextActionService:CallFunction`. These reach `ClientWorld.env()` and then the camera and movement code in `client/main.js`.
5. A short tap no GUI processed becomes a mouse click at that point, so tools and ClickDetectors work.

GUI hit-testing uses `AbsolutePosition` and `AbsoluteSize` from the last layout, so a fix to GUI layout changes touch targets too.

## Test

```sh
node tools/touch.mjs
node tools/corescripts.mjs touch
```

`touch.mjs` should report thumbstick moves, a zero move on release, jump calls only while held, camera rotate calls, pinch zoom calls, a tap click and a working ContextActionService button, with no errors.

## Rules

- Do not draw replacement controls or menus in HTML. The menu on touch devices is the Settings CoreScript, which the engine adds when the StarterScript adds TouchControls, plus the engine-built iOS Leave button and leave menu in `ClientWorld.buildLeaveMenu`.
- GUI coordinates are scaled: `TouchInput.local` multiplies page pixels by `world.guiScale()`. Keep every GUI hit test in those units.
- Movement: `node tools/movement.mjs` checks seams, steps, walls and jumping for the humanoid controller in `shared/humanoid.js`.
- `TouchControlsSheet.png` is built from the iOS app's `thumbstickOuter` (0,0), `thumbstickInner` (220,0), `jumpButtonPress` (0,222) and `jumpbutton` (176,222). Keep those rectangles if it is rebuilt.
- ChatScript's chat bar lives in the 20px strip reserved by `GuiService:SetGlobalGuiInset`; the inset must keep working for chat to be visible.
- Text boxes focused from Lua must be focused inside the tap's event handler for mobile keyboards to open. `Gui` runs a Lua step on button clicks in touch mode for that reason; keep it.

In 2018 games the ControlScript shows touch controls only when `UserInputService:GetLastInputType()` is `Touch`. If the TouchGui exists but every control is `Visible = false`, check `lastInputType` in `ClientWorld.env()` and `Input2018.setLast`.
