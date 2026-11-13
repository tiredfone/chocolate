import { ENUMS } from '../shared/classes.js';
import { T } from '../shared/luahost.js';

const K = ENUMS.KeyCode;
const CODE = {
  Backspace: K.Backspace, Tab: K.Tab, Enter: K.Return, NumpadEnter: K.KeypadEnter, Escape: K.Escape, Space: K.Space,
  Quote: K.Quote, Comma: K.Comma, Minus: K.Minus, Period: K.Period, Slash: K.Slash, Semicolon: K.Semicolon, Equal: K.Equals,
  BracketLeft: K.LeftBracket, Backslash: K.BackSlash, BracketRight: K.RightBracket, Backquote: K.Backquote,
  Delete: K.Delete, Insert: K.Insert, Home: K.Home, End: K.End, PageUp: K.PageUp, PageDown: K.PageDown,
  ArrowUp: K.Up, ArrowDown: K.Down, ArrowLeft: K.Left, ArrowRight: K.Right,
  ShiftLeft: K.LeftShift, ShiftRight: K.RightShift, ControlLeft: K.LeftControl, ControlRight: K.RightControl,
  AltLeft: K.LeftAlt, AltRight: K.RightAlt, MetaLeft: K.LeftSuper, MetaRight: K.RightSuper, CapsLock: K.CapsLock,
  NumLock: K.NumLock, ScrollLock: K.ScrollLock, Pause: K.Pause, PrintScreen: K.Print,
  NumpadDecimal: K.KeypadPeriod, NumpadDivide: K.KeypadDivide, NumpadMultiply: K.KeypadMultiply, NumpadSubtract: K.KeypadMinus, NumpadAdd: K.KeypadPlus,
};
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
for (let i = 0; i < 10; i++) {
  CODE['Digit' + i] = K[DIGITS[i]];
  CODE['Numpad' + i] = K['Keypad' + DIGITS[i]];
}
for (let c = 65; c <= 90; c++) CODE['Key' + String.fromCharCode(c)] = K[String.fromCharCode(c)];
for (let i = 1; i <= 15; i++) CODE['F' + i] = K['F' + i];

export function keyCodeOf(e) {
  return CODE[e.code] ?? 0;
}

const UIT = ENUMS.UserInputType;
const BUTTON_TYPE = [UIT.MouseButton1, UIT.MouseButton3, UIT.MouseButton2];

export class Input2018 {
  constructor(world, gui, canvas, root) {
    this.world = world;
    this.gui = gui;
    this.canvas = canvas;
    this.root = root;
    this.dm = world.dm;
    this.keys = new Map();
    this.buttons = new Set();
    this.delta = [0, 0];
    this.behavior = 0;
    this.last = world.touch ? UIT.Touch : UIT.Keyboard;
    this.moveIO = this.make(UIT.MouseMovement, 0);
    this.wheelIO = this.make(UIT.MouseWheel, 0);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.behavior !== 0 && this.buttons.size === 0) this.relock = true;
    });
  }

  make(type, key) {
    const io = this.dm.create('InputObject', null);
    io.props.set('Name', 'InputObject');
    io.props.set('UserInputType', type);
    io.props.set('KeyCode', key);
    io.props.set('UserInputState', 4);
    io.props.set('Position', [0, 0, 0]);
    io.props.set('Delta', [0, 0, 0]);
    return io;
  }

  pos() {
    const ms = this.world.mouseState;
    const k = this.world.guiScale();
    return [ms.x * k, ms.y * k - 36, 0];
  }

  setLast(type) {
    if (this.last === type) return;
    this.last = type;
    this.dm.emit(this.dm.services.get('UserInputService'), 'LastInputTypeChanged', T.e('UserInputType', type));
  }

  send(io, processed, kind) {
    this.dm.emit(this.dm.services.get('UserInputService'), '__Input', io, !!processed, kind);
  }

  keyDown(e, typing) {
    const key = keyCodeOf(e);
    if (!key || e.repeat) return;
    const io = this.make(UIT.Keyboard, key);
    io.props.set('UserInputState', 0);
    this.keys.set(key, io);
    this.setLast(UIT.Keyboard);
    this.send(io, typing, 'b');
  }

  keyUp(e, typing) {
    const key = keyCodeOf(e);
    const io = this.keys.get(key);
    if (!io) return;
    this.keys.delete(key);
    io.props.set('UserInputState', 2);
    this.send(io, typing, 'e');
    setTimeout(() => { if (!io.destroyed) this.dm.destroy(io); }, 1000);
  }

  blur() {
    for (const [key, io] of [...this.keys]) {
      this.keys.delete(key);
      io.props.set('UserInputState', 2);
      this.send(io, false, 'e');
    }
  }

  buttonDown(button, overGui, at) {
    const type = BUTTON_TYPE[button];
    if (type === undefined) return;
    this.buttons.add(type);
    const io = this.make(type, 0);
    io.props.set('UserInputState', 0);
    io.props.set('Position', this.pos());
    this['btn' + button] = io;
    this.setLast(UIT.MouseButton1);
    if (at && this.gui.guiInput) this.gui.guiInput('b', io, at[0], at[1]);
    this.send(io, overGui, 'b');
  }

  buttonUp(button, overGui, at) {
    const type = BUTTON_TYPE[button];
    const io = this['btn' + button];
    this.buttons.delete(type);
    if (!io) return;
    this['btn' + button] = null;
    io.props.set('UserInputState', 2);
    io.props.set('Position', this.pos());
    if (at && this.gui.guiInput) this.gui.guiInput('e', io, at[0], at[1]);
    this.send(io, overGui, 'e');
    setTimeout(() => { if (!io.destroyed) this.dm.destroy(io); }, 1000);
  }

  mouseMove(dx, dy, overGui, at) {
    const gs = this.world.gameSettings && this.world.gameSettings();
    const sens = gs ? Math.max(0.1, Math.min(10, +gs.props.get('MouseSensitivity') || 1)) : 1;
    const k = this.world.guiScale() * (this.behavior === 1 || document.pointerLockElement === this.canvas ? sens : 1);
    this.delta[0] += dx * k;
    this.delta[1] += dy * k;
    const io = this.moveIO;
    io.props.set('UserInputState', 1);
    io.props.set('Position', this.pos());
    io.props.set('Delta', [dx * k, dy * k, 0]);
    this.setLast(UIT.MouseMovement);
    if (at && this.gui.guiInput) this.gui.guiInput('c', io, at[0], at[1]);
    this.send(io, overGui, 'c');
  }

  wheel(dir, overGui) {
    const parts = 4;
    for (let i = 0; i < parts; i++) {
      setTimeout(() => {
        const io = this.wheelIO;
        io.props.set('UserInputState', 1);
        io.props.set('Position', [...this.pos().slice(0, 2), dir / parts]);
        this.send(io, overGui, 'c');
      }, i * 16);
    }
  }

  takeDelta() {
    const d = this.delta;
    this.delta = [0, 0];
    return d;
  }

  isKeyDown(key) {
    return this.keys.has(key | 0);
  }

  setBehavior(v) {
    this.behavior = v | 0;
    const c = this.canvas;
    if (this.behavior !== 0) {
      if (document.pointerLockElement !== c && c.requestPointerLock) {
        try {
          const r = c.requestPointerLock();
          if (r && r.catch) r.catch(() => {});
        } catch {}
      }
    } else if (document.pointerLockElement === c) document.exitPointerLock();
  }
}
