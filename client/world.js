import { DataModel } from '../shared/instance.js';
import { applyRecords, decodeValue, encodeValue } from '../shared/codec.js';
import { ScriptHost, wireArgs, unwireArgs, T } from '../shared/luahost.js';
import { Core2018 } from '../shared/core2018.js';
import { FLAGS_2018 } from '../shared/api2018.js';
import { Physics } from '../shared/physics.js';
import * as C from '../shared/cframe.js';
import { Rig, Controller, CharacterProxy, liveCharacterOf, animate, stepMotors, holdsTool, syncGrip, STATES, rootOf } from '../shared/humanoid.js';
import { loadAudio, assetId, builtin, loadCoreSources, assetBytes, animationBytes, publicPath, endpointUrl, useContent2018 } from './assets.js';
import { parsePlace } from '../shared/rbxl.js';
import { Animations, animAssetId } from '../shared/animator.js';

export const STARTER_SCRIPT = 37801172;
export const SETTINGS_SCRIPT = 46295863;
export const TOUCH_CONTROLS_SCRIPT = 153556783;

const SEND_HZ = 20;

export class ClientWorld {
  constructor(net, hooks = {}) {
    this.net = net;
    this.hooks = hooks;
    this.dm = new DataModel('client');
    this.chars = new Map();
    this.own = null;
    this.ownModel = null;
    this.tpSeq = 0;
    this.sendAcc = 0;
    this.t = 0;
    this.mouseState = { x: 0, y: 0, ndc: [0, 0], overGui: false, down: false, hoverCD: null, pressCD: null };
    this.keys = new Set();
    this.selectedBin = null;
    this.equippedTool = null;
    this.friendStatus = new Map();
    this.toolMouse = null;
    this.mouseSendAcc = 0;
    this.sounds = new Map();
    this.audio = null;
    this.touch = !!hooks.touch;
    this.guiInset = [0, 0, 0, 0];
    this.touchMove = null;
    this.touchJump = false;
    this.era = 2012;
    this.luaMove = null;
    this.invokes = new Map();
    this.invokeSeq = 1;
  }

  uisInput(io, processed, kind) {
    const uis = this.dm.services.get('UserInputService');
    if (this.era === 2018) {
      this.dm.emit(uis, '__Input', io, !!processed, kind);
      return;
    }
    this.dm.emit(uis, kind === 'b' ? 'InputBegan' : kind === 'e' ? 'InputEnded' : 'InputChanged', io, !!processed);
  }

  async load2018() {
    const v = this.hooks.version ? '?v=' + this.hooks.version : '';
    const [bundle, runtime] = await Promise.all([
      fetch(publicPath('/corescripts2018/bundle.json') + v).then((r) => (r.ok ? r.json() : {})),
      fetch(publicPath('/shared/runtime2018.lua') + v).then((r) => (r.ok ? r.text() : '')),
      useContent2018(),
    ]);
    return { bundle, runtime };
  }

  async init(msg, RAPIER, luaFactory, runtimeSrc) {
    const dm = this.dm;
    this.era = msg.era === 2018 ? 2018 : 2012;
    dm.era = this.era;
    const pack = this.era === 2018 ? await this.load2018() : null;
    applyRecords(dm, msg.snap);
    for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'Debris', 'ReplicatedStorage', 'ReplicatedFirst', 'RunService', 'UserInputService', 'ContentProvider', 'GuiService', 'Chat']) dm.service(s);
    this.player = dm.byId.get(msg.you);
    this.user = msg.user;
    const players = dm.services.get('Players');
    players.props.set('LocalPlayer', this.player);
    this.mouse = dm.create('PlayerMouse', null);
    this.mouse.props.set('Name', 'Mouse');
    const ws = dm.services.get('Workspace');
    this.camera = dm.create('Camera', null);
    this.camera.props.set('Name', 'Camera');
    this.camera.props.set('CameraType', 5);
    this.camera.props.set('FieldOfView', 70);
    for (const o of dm.observers) if (o.created) o.created(this.camera);
    dm.setParent(this.camera, ws);
    ws.props.set('CurrentCamera', this.camera);
    this.physics = new Physics(dm, RAPIER, { simulate: false, excluded: (p) => !!liveCharacterOf(p) });
    this.physics.attachWorkspace(ws);
    dm.observe({
      reparented: (inst, old, opts) => this.onReparent(inst, old, opts),
      destroyed: (inst) => {
        if (this.chars.has(inst)) this.dropChar(inst);
        if (this.sounds.has(inst)) this.stopSound(inst);
      },
      changed: (inst, name, old, opts) => this.onChange(inst, name, old, opts),
    });
    for (const d of ws.descendants()) if (d.ClassName === 'Model' && d.findChildOfClass('Humanoid')) this.trackChar(d);
    this.coreSources = pack ? new Map() : await loadCoreSources([STARTER_SCRIPT]).catch(() => new Map());
    const coreGui = dm.service('CoreGui');
    this.robloxGui = dm.create('ScreenGui', null);
    this.robloxGui.props.set('Name', 'RobloxGui');
    this.robloxGui.props.set('AbsoluteSize', this.guiArea().size);
    for (const o of dm.observers) if (o.created) o.created(this.robloxGui);
    dm.setParent(this.robloxGui, coreGui);
    if (pack) {
      for (const s of ['StarterPlayer', 'TweenService', 'TextService', 'LocalizationService', 'VRService', 'RobloxReplicatedStorage']) dm.service(s);
      this.core = new Core2018(dm, pack.bundle);
      this.core.buildModules(this.robloxGui);
      const cf = this.gui('Frame', 'ControlFrame', this.robloxGui, { BackgroundTransparency: 1, Size: [1, 0, 1, 0] });
      this.gui('Frame', 'BottomLeftControl', cf, { BackgroundTransparency: 1, Position: [0, 0, 1, -50], Size: [0, 130, 0, 50] });
    } else this.buildControlFrame();
    for (const s of ['ScriptContext', 'GuiService', 'LogService', 'MarketplaceService', 'TeleportService', 'InsertService', 'ChangeHistoryService', 'PersonalServerService', 'PointsService', 'HttpService', 'ContextActionService', 'NetworkClient', 'CollectionService', 'LocalBackpack']) dm.service(s);
    const uis = dm.services.get('UserInputService');
    uis.props.set('TouchEnabled', this.touch);
    uis.props.set('MouseEnabled', !this.touch);
    uis.props.set('KeyboardEnabled', !this.touch);
    this.host = new ScriptHost(dm, this.env());
    this.anims = new Animations(dm, async (id) => {
      const bytes = await animationBytes(id);
      if (!new TextDecoder().decode(bytes.subarray(0, 8)).startsWith('<roblox')) throw new Error('asset ' + id + ' is not a model');
      const model = dm.create('Model', null);
      model.props.set('Name', 'Model');
      dm.load(parsePlace(bytes), model);
      return model;
    });
    if (pack) this.host.flags = FLAGS_2018;
    await this.host.init(luaFactory, runtimeSrc, pack && pack.runtime ? [{ source: pack.runtime, name: 'runtime2018' }] : []);
    if (pack) {
      dm.root.props.set('PlaceId', msg.place | 0);
      this.core.coreScript('LoadingScript', this.robloxGui);
      this.core.starterScript(dm.services.get('ScriptContext'), false);
    }
    else if (this.coreSources.get(STARTER_SCRIPT)) this.addCoreScript(STARTER_SCRIPT, dm.services.get('ScriptContext'), 'StarterScript');
    for (const d of dm.root.descendants()) if (d.isA('Sound') && d.props.get('IsPlaying')) this.playSound(d, 'play');
  }

  gui(cls, name, parent, props = {}) {
    const dm = this.dm;
    const g = dm.create(cls, null);
    g.props.set('Name', name);
    for (const [k, v] of Object.entries(props)) g.props.set(k, v);
    for (const o of dm.observers) if (o.created) o.created(g);
    dm.setParent(g, parent);
    return g;
  }

  controlButton(parent, name, image, pos, size, action) {
    const base = `rbxasset://textures/${image}`;
    const b = this.gui('ImageButton', name, parent, { Image: base + '.png', BackgroundTransparency: 1, Position: pos, Size: size, ZIndex: 2 });
    const set = (suffix) => !b.destroyed && this.dm.setProp(b, 'Image', base + suffix + '.png');
    let over = false;
    b.on('MouseEnter', () => { over = true; set('_ovr'); });
    b.on('MouseLeave', () => { over = false; set(''); });
    b.on('MouseButton1Down', () => set('_dn'));
    b.on('MouseButton1Up', () => set(over ? '_ovr' : ''));
    if (action) b.on('MouseButton1Click', action);
    return b;
  }

  buildControlFrame() {
    const h = this.hooks;
    const cf = this.gui('Frame', 'ControlFrame', this.robloxGui, { BackgroundTransparency: 1, Size: [1, 0, 1, 0] });
    const bl = this.gui('Frame', 'BottomLeftControl', cf, { BackgroundTransparency: 1, Position: [0, 0, 1, -50], Size: [0, 130, 0, 50] });
    if (this.touch) bl.on('Changed', (name) => { if (name === 'Visible' && !bl.props.get('Visible') && !bl.destroyed) this.dm.setProp(bl, 'Visible', true); });
    this.controlButton(bl, 'Exit', 'Exit', [0, 0, 0, -1], [0, 70, 0, 51], () => h.leave && h.leave());
    if (!this.touch) {
      const br = this.gui('Frame', 'BottomRightControl', cf, { BackgroundTransparency: 1, Position: [1, -50, 1, -48], Size: [0, 48, 0, 46] });
      this.controlButton(br, 'CameraTiltUp', 'CameraTiltUp', [0, 2, 0, 0], [0, 22, 0, 22], () => h.cameraTilt && h.cameraTilt(1));
      this.controlButton(br, 'CameraTiltDown', 'CameraTiltDown', [0, 2, 0, 23], [0, 22, 0, 22], () => h.cameraTilt && h.cameraTilt(-1));
      this.controlButton(br, 'CameraZoomIn', 'CameraZoomIn', [0, 25, 0, 0], [0, 22, 0, 22], () => h.cameraZoom && h.cameraZoom(1));
      this.controlButton(br, 'CameraZoomOut', 'CameraZoomOut', [0, 25, 0, 23], [0, 22, 0, 22], () => h.cameraZoom && h.cameraZoom(-1));
    }
    const tl = this.gui('Frame', 'TopLeftControl', cf, { BackgroundTransparency: 1, Position: [0, 0, 0, 0], Size: [0, 115, 0, 51] });
    this.controlButton(tl, 'Help', 'Help', [0, 0, 0, 0], [0, 45, 0, 51], null);
    this.controlButton(tl, 'Exit', 'Exit', [0, 45, 0, 0], [0, 70, 0, 51], () => h.leave && h.leave());
    if (this.touch) this.buildLeaveMenu(cf);
  }

  buildLeaveMenu(cf) {
    const h = this.hooks;
    const img = (name) => `rbxasset://textures/ui/${name}.png`;
    const leave = this.gui('ImageButton', 'LeaveButton', cf, { Image: img('LeaveMenuLeaveBtn'), BackgroundTransparency: 1, Position: [0, 6, 0, 6], Size: [0, 150, 0, 56], ZIndex: 8 });
    const shield = this.gui('TextButton', 'LeaveMenuShield', cf, { Text: '', AutoButtonColor: false, Active: true, Visible: false, BackgroundColor3: [0, 0, 0], BackgroundTransparency: 0.5, BorderSizePixel: 0, Size: [1, 0, 1, 0], ZIndex: 9 });
    const menu = this.gui('ImageLabel', 'LeaveMenu', shield, { Image: img('LeaveMenuBkgd'), BackgroundTransparency: 1, Position: [0.5, -220, 0.5, -160], Size: [0, 440, 0, 256], ZIndex: 9 });
    this.gui('TextLabel', 'Title', menu, { Text: 'Leave this game?', BackgroundTransparency: 1, Position: [0, 0, 0, 40], Size: [1, 0, 0, 60], Font: 2, FontSize: 7, TextColor3: [1, 1, 1], ZIndex: 10 });
    const yes = this.gui('ImageButton', 'Leave', menu, { Image: img('LeaveMenuLeaveBtn'), BackgroundTransparency: 1, Position: [0.5, -160, 1, -86], Size: [0, 150, 0, 56], ZIndex: 10 });
    const no = this.gui('ImageButton', 'Cancel', menu, { Image: img('LeaveMenuCancelBtn'), BackgroundTransparency: 1, Position: [0.5, 10, 1, -86], Size: [0, 150, 0, 56], ZIndex: 10 });
    const show = (on) => {
      if (shield.destroyed) return;
      this.dm.setProp(shield, 'Visible', on);
      const uis = this.dm.services.get('UserInputService');
      if (uis) this.dm.setProp(uis, 'ModalEnabled', on);
    };
    leave.on('MouseButton1Click', () => show(true));
    no.on('MouseButton1Click', () => show(false));
    yes.on('MouseButton1Click', () => h.leave && h.leave());
  }

  markLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    this.dm.emit(this.dm.root, 'Loaded');
  }

  addCoreScript(id, parent, name) {
    if (this.touch && id === TOUCH_CONTROLS_SCRIPT && !this.touchSettings) {
      this.touchSettings = true;
      this.addCoreScript(SETTINGS_SCRIPT, parent, 'CoreScripts/Settings');
    }
    const src = this.coreSources.get(id);
    if (!src) {
      if (this.hooks.log) this.hooks.log('warn', `CoreScript ${id} (${name}) is not available`, null);
      return;
    }
    const dm = this.dm;
    const s = dm.create('CoreScript', null);
    s.props.set('Name', String(name));
    s.props.set('Source', src);
    for (const o of dm.observers) if (o.created) o.created(s);
    dm.setParent(s, parent && !parent.destroyed ? parent : dm.services.get('ScriptContext'));
  }

  guiScale() {
    const s = this.hooks.screenSize && this.hooks.screenSize();
    if (!s || !(s[0] > 0) || !(s[1] > 0)) return 1;
    return Math.max(1, 640 / Math.min(s[0], s[1]));
  }

  guiArea() {
    const [w, h] = this.screenSize();
    const [l, t, r, b] = this.guiInset;
    return { pos: [l, t], size: [Math.max(0, w - l - r), Math.max(0, h - t - b)] };
  }

  screenSize() {
    const s = this.hooks.screenSize && this.hooks.screenSize();
    if (!s || !(s[0] > 0) || !(s[1] > 0)) return [1024, 768];
    const k = this.guiScale();
    return [Math.round(s[0] * k), Math.round(s[1] * k)];
  }

  env() {
    return {
      touch: () => this.touch,
      setGuiInset: (v) => {
        this.guiInset = v.map((n) => Math.max(0, Math.min(400, n | 0)));
        if (this.hooks.guiInsetChanged) this.hooks.guiInsetChanged(this.guiInset);
      },
      verb: (v) => {
        const h = this.hooks;
        if (v === 'Exit') h.leave && h.leave();
        else if (v === 'ToggleFullScreen') h.toggleFullscreen && h.toggleFullscreen();
        else if (v === 'Screenshot') h.screenshot && h.screenshot();
      },
      isLoaded: () => !!this.loaded,
      message: () => (this.hooks.message ? this.hooks.message() : ''),
      loadingGuiRemoved: () => !!this.loadingGuiRemoved,
      removeLoadingGui: () => {
        if (this.loadingGuiRemoved) return;
        this.loadingGuiRemoved = true;
        const rf = this.dm.services.get('ReplicatedFirst');
        if (rf) this.dm.emit(rf, 'RemoveDefaultLoadingGuiSignal');
      },
      inFullscreen: () => !!(this.hooks.inFullscreen && this.hooks.inFullscreen()),
      screenSize: () => this.screenSize(),
      mouseLocation: () => [this.mouseState.x, this.mouseState.y],
      rotateCamera: (dx, dy) => this.hooks.rotateCamera && this.hooks.rotateCamera(dx, dy),
      zoomCamera: (d) => this.hooks.zoomCamera && this.hooks.zoomCamera(d),
      moveCharacter: (pl, x, y, max) => {
        if (pl !== this.player) return;
        const m = Math.max(1e-3, Math.abs(max));
        let mx = x / m, my = y / m;
        const len = Math.hypot(mx, my);
        if (len > 1) {
          mx /= len;
          my /= len;
        }
        this.touchMove = len < 1e-3 ? null : [mx, my];
      },
      jumpCharacter: (pl) => {
        if (pl === this.player) this.touchJump = true;
      },
      addCoreScript: (id, parent, name) => this.addCoreScript(id, parent, name),
      coreSource: (id) => this.coreSources.get(id) || null,
      chat: (target, msg, kind) => {
        if (msg) this.net.send({ t: 'chat', m: msg, k: kind, to: target && target.id > 0 ? target.id : undefined });
      },
      shutdown: () => this.hooks.leave && this.hooks.leave(),
      log: (k, m, w) => this.hooks.log && this.hooks.log(k, m, w),
      localPlayer: () => this.player,
      mouseFor: (pl) => (pl === this.player ? this.mouse : null),
      raycast: (o, d, ig) => this.physics.raycast(o, d, ig),
      equipTool: (h, tool) => { if (tool && this.ownModel && h.parent === this.ownModel) this.net.send({ t: 'equip', id: tool.id }); },
      unequipTools: (h) => { if (this.equippedTool) this.net.send({ t: 'unequip', id: this.equippedTool.id }); },
      deselectBin: (b) => { if (this.selectedBin === b) this.toggleSlot(b); },
      friendStatus: (pl, other) => (pl === this.player && other ? this.friendStatus.get(other.id) || 1 : 1),
      friendRequest: (pl, other, on) => { if (pl === this.player && other && other !== pl && other.ClassName === 'Player') this.net.send({ t: 'friend', id: other.id, on: !!on }); },
      areFriends: (pl, uid) => {
        const players = this.dm.services.get('Players');
        const other = players && players.children.find((c) => c.ClassName === 'Player' && c.props.get('userId') === uid);
        return Promise.resolve(!!(pl === this.player && other && this.friendStatus.get(other.id) === 2));
      },
      toggleBin: (b) => { if (b && b.parent && this.ownModel && b.parent.ClassName === 'Backpack') this.toggleSlot(b); },
      sound: (s, op) => this.playSound(s, op),
      animate: (tr, op, a, b, c) => {
        const hum = tr.data.hum;
        const anim = tr.props.get('Animation');
        const id = animAssetId(anim && anim.props.get('AnimationId'));
        this.anims.op(hum, 'l' + tr.id, op, id, a, b, c, tr);
        if (this.net && hum.id > 0 && this.ownModel && hum.parent === this.ownModel) this.net.send({ t: 'anim', h: hum.id, k: tr.id, op, id, a, b, c });
      },
      playingTracks: (h) => this.anims.playing(h),
      animTrack: (t) => this.anims.trackOf(t),
      humanoidMoveTo: (h, pos) => {
        if (this.own && h === this.own.hum) this.own.moveTo = pos ? pos.slice() : null;
      },
      kick: (pl, msg) => { if (pl === this.player && this.hooks.kicked) this.hooks.kicked(msg || 'You have been kicked'); },
      focusTextBox: (t, on) => this.hooks.focusTextBox && this.hooks.focusTextBox(t, on),
      lastInputType: () => (this.input2018 ? this.input2018.last : this.touch ? 7 : 8),
      isKeyDown: (k) => (typeof k === 'number' && this.hooks.isKeyCodeDown ? this.hooks.isKeyCodeDown(k) : this.keys.has(String(k).toLowerCase())),
      setMessage: (m) => this.hooks.setMessage && this.hooks.setMessage(m),
      breakJoints: (p) => { if (this.ownModel && p.id > 0 && p.isDescendantOf(this.ownModel)) this.net.send({ t: 'break', id: p.id }); return null; },
      makeJoints: () => null,
      connectedParts: (p) => [p],
      touchingParts: () => [],
      loadAsset: async (id) => {
        const bytes = await assetBytes(id);
        const head = new TextDecoder().decode(bytes.subarray(0, 8));
        if (!head.startsWith('<roblox')) throw new Error('asset ' + id + ' is not a model');
        const dm = this.dm;
        const model = dm.create('Model', null);
        model.props.set('Name', 'Model');
        dm.load(parsePlace(bytes), model);
        return model;
      },
      linkedSource: async (url) => {
        const id = assetId(url);
        if (!id) return '';
        return new TextDecoder().decode(await assetBytes(id));
      },
      bubbleChat: (part, msg, color) => {
        if (this.era === 2018) this.dm.emit(this.dm.services.get('Chat'), 'Chatted', part, msg, T.e('ChatColor', typeof color === 'number' ? color : (color && color.value) | 0));
        else if (this.hooks.bubble) this.hooks.bubble(part, msg);
      },
      addCoreScriptLocal: (name, parent) => {
        if (this.core && !this.core.coreScript(name, parent && !parent.destroyed ? parent : this.dm.services.get('ScriptContext')) && this.hooks.log) this.hooks.log('warn', `CoreScript ${name} is not available`, null);
      },
      platform: () => (this.touch ? (/android/i.test(navigator.userAgent) ? 3 : 2) : /mac/i.test(navigator.platform || '') ? 1 : 0),
      thumbnailUrl: (id, kind) => (kind === 'avatar' && endpointUrl('avatarThumbnail', id)) || endpointUrl('thumbnail', id) || '',
      placeThumbnailUrl: (id) => endpointUrl('placeThumbnail', id) || '',
      productInfo: (id) => {
        const h = this.hooks.placeInfo ? this.hooks.placeInfo() : {};
        const mine = id === (this.dm.root.props.get('PlaceId') | 0);
        return { AssetId: id, Name: mine ? String(h.name || '') : '', Description: '', AssetTypeId: mine ? 9 : 0, IsForSale: false, PriceInRobux: 0, Creator: { Name: mine ? String(h.creator || '') : '', CreatorType: 'User', Id: 0 } };
      },
      guiInsetTopLeft: () => [0, 36],
      playerMove: (pl, dir, relative) => {
        if (pl !== this.player || !Array.isArray(dir)) return;
        let [x, , z] = dir;
        const len = Math.hypot(x, z);
        if (len < 1e-3) {
          this.luaMove = null;
          return;
        }
        if (len > 1) {
          x /= len;
          z /= len;
        }
        if (relative) {
          const cf = this.camera.props.get('CFrame');
          let fx = -cf[5], fz = -cf[11];
          const fl = Math.hypot(fx, fz) || 1;
          fx /= fl;
          fz /= fl;
          const rx = -fz, rz = fx;
          this.luaMove = [rx * x - fx * z, 0, rz * x - fz * z];
        } else this.luaMove = [x, 0, z];
      },
      humanoidMove: (h, dir, relative) => {
        if (this.own && h === this.own.hum) this.host.env.playerMove(this.player, dir, relative);
      },
      remote: (r, op, raw) => {
        if (op === 'fs' && r.id > 0) this.net.send({ t: 're', id: r.id, a: wireArgs(raw) });
      },
      invoke: (r, pl, raw) => {
        if (r.id <= 0) return Promise.resolve([false, 'RemoteFunction is not replicated']);
        const k = this.invokeSeq++;
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.invokes.delete(k);
            resolve([false, 'InvokeServer timed out']);
          }, 30000);
          this.invokes.set(k, { resolve, timer });
          this.net.send({ t: 'rf', id: r.id, k, a: wireArgs(raw) });
        });
      },
      invokeResult: (r, token, raw) => this.net.send({ t: 'rfr', k: token | 0, a: wireArgs(raw) }),
      mouseBehavior: (v) => this.hooks.mouseBehavior && this.hooks.mouseBehavior(v),
      mouseIconEnabled: (on) => this.hooks.mouseIconEnabled && this.hooks.mouseIconEnabled(on),
      mouseDelta: () => (this.hooks.mouseDelta ? this.hooks.mouseDelta() : [0, 0]),
      mouseButtonDown: (t) => !!(this.hooks.mouseButtonDown && this.hooks.mouseButtonDown(t)),
      screenRay: (x, y) => this.hooks.screenRay && this.hooks.screenRay(x, y),
      worldToScreen: (p) => this.hooks.worldToScreen && this.hooks.worldToScreen(p),
      measureText: (text, size, font, frame) => this.hooks.measureText && this.hooks.measureText(text, size, font, frame),
    };
  }

  onReparent(inst, old, opts) {
    const ws = this.dm.services.get('Workspace');
    for (const [model, rec] of this.chars) {
      if (model === inst || inst.isDescendantOf(model) || (old && (old === model || old.isDescendantOf(model)))) rec.dirty = true;
      if (!model.isDescendantOf(ws)) this.dropChar(model);
    }
    if (ws && (inst === ws || inst.isDescendantOf(ws))) {
      if (inst.ClassName === 'Humanoid' && inst.parent) this.trackChar(inst.parent);
      if (inst.ClassName === 'Model' && inst.findChildOfClass('Humanoid')) this.trackChar(inst);
      for (const d of inst.descendants()) if (d.ClassName === 'Model' && d.findChildOfClass('Humanoid')) this.trackChar(d);
    }
    if (inst.ClassName === 'Tool' || inst.ClassName === 'HopperBin') this.toolMoved(inst, old, !(opts && opts.remote));
    if (this.hooks.reparented) this.hooks.reparented(inst, old);
  }

  onChange(inst, name, old, opts) {
    if (name === 'Grip' && inst.ClassName === 'Tool' && !(opts && opts.remote)) syncGrip(this.dm, inst);
    if (name === 'Value' && !(opts && opts.remote) && inst.id > 0 && inst.isA('ValueBase') && this.ownsValue(inst)) {
      const p = inst.info.all.get('Value');
      const v = p ? encodeValue(p.type, inst.props.get('Value')) : undefined;
      if (v !== undefined) this.net.send({ t: 'val', id: inst.id, v });
    }
    if (name === 'Health' && !(opts && opts.remote) && inst.id > 0 && inst.ClassName === 'Humanoid' && this.ownModel && inst.parent === this.ownModel) {
      const v = inst.props.get('Health');
      if (Number.isFinite(v)) this.net.send({ t: 'hp', v });
    }
    if (inst.ClassName === 'Player' && name === 'Character') {
      const now = inst.props.get('Character');
      if (old && old !== now && !old.destroyed) this.dm.emit(inst, 'CharacterRemoving', old);
      if (now && now !== old) this.dm.emit(inst, 'CharacterAdded', now);
    }
    if (inst.ClassName === 'Humanoid' && name === 'Health' && this.dm.hasListener(inst, 'HealthChanged')) this.dm.emit(inst, 'HealthChanged', inst.props.get('Health'));
    if (inst.ClassName === 'Humanoid' && name === 'Health' && inst.props.get('Health') <= 0) {
      const rec = this.chars.get(inst.parent);
      if (rec) this.charDied(rec);
    }
    if (inst.isA('Sound') && (name === 'Volume' || name === 'Pitch')) this.updateSound(inst);
    if (name === 'CFrame' && this.era === 2018 && opts && opts.lua && this.own && this.own.ctrl && inst === rootOf(this.ownModel)) {
      const cf = inst.props.get('CFrame');
      const lx = -cf[5], lz = -cf[11];
      const ctrl = this.own.ctrl;
      if (Math.hypot(lx, lz) > 1e-3) ctrl.yawCF = C.lookAt(0, 0, 0, lx, 0, lz);
      const rec = this.own.rec;
      if (Math.hypot(cf[0] - rec.cf[0], cf[1] - rec.cf[1], cf[2] - rec.cf[2]) > 0.75) {
        ctrl.teleport(cf);
        rec.cf = cf.slice();
      } else rec.cf = C.withPos(ctrl.yawCF, rec.cf[0], rec.cf[1], rec.cf[2]);
    }
  }

  trackChar(model) {
    if (this.chars.has(model)) return this.chars.get(model);
    const hum = model.findChildOfClass('Humanoid');
    const torso = rootOf(model);
    if (!hum || !torso || !model.findChild('Head') || hum.props.get('Health') <= 0 || torso.props.get('Anchored')) return null;
    const rec = { model, hum, rig: new Rig(model), proxy: null, target: torso.props.get('CFrame'), cf: torso.props.get('CFrame'), vel: [0, 0, 0], state: STATES.idle, dirty: false, t: 0 };
    rec.proxy = new CharacterProxy(this.physics, model, { sensors: false, blocking: true });
    this.chars.set(model, rec);
    for (const d of model.descendants()) if (d.isA('BasePart')) this.physics.removePart(d);
    if (this.pendingOwn && this.pendingOwn.id === model.id) this.takeOwnership(this.pendingOwn);
    return rec;
  }

  dropChar(model) {
    const rec = this.chars.get(model);
    if (!rec) return;
    this.chars.delete(model);
    if (rec.proxy) rec.proxy.destroy();
    if (this.own && this.own.model === model) {
      this.own.ctrl.destroy();
      this.own = null;
    }
  }

  charDied(rec) {
    if (rec.dead) return;
    rec.dead = true;
    const model = rec.model;
    this.dropChar(model);
    model.data = model.data || {};
    model.data.dead = true;
    for (const d of model.descendants()) if (d.isA('BasePart')) this.physics.enter(d);
    if (this.hooks.died && model === this.ownModel) this.hooks.died();
  }

  takeOwnership(m) {
    const model = this.dm.byId.get(m.id);
    const rec = model && this.chars.get(model);
    if (!rec) {
      this.pendingOwn = m;
      return;
    }
    this.pendingOwn = null;
    if (this.own) this.own.ctrl.destroy();
    if (rec.proxy) {
      rec.proxy.destroy();
      rec.proxy = null;
    }
    const ctrl = new Controller(this.physics, model, rec.hum);
    ctrl.teleport(m.c);
    this.tpSeq = m.s;
    this.own = { model, hum: rec.hum, ctrl, rec, moveTo: null, last: null };
    this.ownModel = model;
    rec.cf = m.c;
    if (this.equippedTool && this.equippedTool.parent !== model) {
      this.equippedTool = null;
      this.toolMouse = null;
    }
    const held = model.children.find((c) => c.ClassName === 'Tool');
    if (held && this.equippedTool !== held) {
      this.equippedTool = held;
      this.dm.emit(held, 'Equipped', this.openToolMouse());
    }
    if (this.hooks.ownCharacter) this.hooks.ownCharacter(model);
    if (held && this.hooks.backpackChanged) this.hooks.backpackChanged();
  }

  applyRep(msg) {
    const dm = this.dm;
    for (const op of msg.o || []) {
      try {
        this.applyOp(op);
      } catch (e) {
        console.warn('replication op failed', op[0], e);
      }
    }
    if (msg.ph) {
      for (const r of msg.ph) {
        const inst = dm.byId.get(r[0]);
        if (!inst || !inst.isA('BasePart')) continue;
        if (this.ownModel && inst.isDescendantOf(this.ownModel) && this.own) continue;
        dm.setProp(inst, 'CFrame', r.slice(1, 13), { remote: true });
        inst.props.set('Velocity', [r[13], r[14], r[15]]);
      }
    }
    if (msg.ch) {
      for (const r of msg.ch) {
        const model = dm.byId.get(r[0]);
        const rec = model && this.chars.get(model);
        if (!rec) continue;
        rec.target = r.slice(1, 13);
        rec.vel = [r[13], r[14], r[15]];
        rec.state = r[16];
        rec.seen = this.t;
      }
    }
    for (const a of msg.after || []) {
      if (a.t === 'own') this.takeOwnership(a);
      else if (a.t === 'tp' && this.own) {
        this.tpSeq = a.s;
        this.own.ctrl.teleport(a.c);
        if (a.v) this.own.ctrl.vel = a.v.slice();
      }
    }
  }

  applyOp(op) {
    const dm = this.dm;
    switch (op[0]) {
      case 'p': {
        const inst = dm.byId.get(op[1]);
        if (!inst) return;
        const p = inst.info.all.get(op[2]);
        if (!p) return;
        if (this.own && op[2] === 'CFrame' && inst.isDescendantOf(this.own.model)) return;
        dm.setProp(inst, op[2], decodeValue(dm, p.type, op[3]), { remote: true });
        break;
      }
      case 'n':
        applyRecords(dm, op[1]);
        break;
      case 'm': {
        const inst = dm.byId.get(op[1]);
        const par = op[2] == null ? null : op[2] === 0 ? dm.root : dm.byId.get(op[2]);
        if (!inst || inst.parentLocked) return;
        if (op[2] != null && !par) return;
        dm.setParent(inst, par, { remote: true });
        break;
      }
      case 'd': {
        const inst = dm.byId.get(op[1]);
        if (inst) dm.destroy(inst);
        break;
      }
      case 's': {
        const inst = dm.byId.get(op[1]);
        if (inst) this.playSound(inst, op[2]);
        break;
      }
    }
  }

  ownsValue(inst) {
    const pl = this.player;
    if (!pl) return false;
    if (this.ownModel && inst.isDescendantOf(this.ownModel)) return true;
    for (const c of pl.children) if ((c.ClassName === 'Backpack' || c.ClassName === 'PlayerGui') && inst.isDescendantOf(c)) return true;
    return false;
  }

  toolMoved(tool, old, local) {
    if (!this.ownModel) return;
    const inChar = tool.parent === this.ownModel;
    const wasChar = old === this.ownModel;
    if (local && tool.ClassName === 'Tool' && this.net && inChar !== wasChar) {
      const bp = this.player && this.player.findChildOfClass('Backpack');
      if (inChar && old === bp) this.net.send({ t: 'equip', id: tool.id });
      else if (wasChar && tool.parent === bp) this.net.send({ t: 'unequip', id: tool.id });
    }
    if (tool.ClassName === 'Tool') {
      if (inChar && !wasChar) {
        this.equippedTool = tool;
        this.dm.emit(tool, 'Equipped', this.openToolMouse());
      } else if (!inChar && wasChar) {
        if (this.equippedTool === tool) {
          this.equippedTool = null;
          this.toolMouse = null;
        }
        this.dm.emit(tool, 'Unequipped');
      }
    }
    if (this.hooks.backpackChanged) this.hooks.backpackChanged();
  }

  backpackItems() {
    const bp = this.player && this.player.findChildOfClass('Backpack');
    const items = [];
    if (this.ownModel) for (const c of this.ownModel.children) if (c.ClassName === 'Tool') items.push(c);
    if (bp) for (const c of bp.children) if (c.ClassName === 'Tool' || c.ClassName === 'HopperBin') items.push(c);
    if (!this.slotOrder) this.slotOrder = [];
    this.slotOrder = this.slotOrder.filter((t) => items.includes(t));
    for (const t of items) if (!this.slotOrder.includes(t)) this.slotOrder.push(t);
    return this.slotOrder.slice(0, 10);
  }

  toggleSlot(item) {
    if (!item || !this.ownModel || !this.own) return;
    if (item.ClassName === 'HopperBin') {
      if (this.equippedTool) this.net.send({ t: 'unequip', id: this.equippedTool.id });
      const on = this.selectedBin !== item;
      if (this.selectedBin) {
        this.toolMouse = null;
        this.dm.emit(this.selectedBin, 'Deselected');
        this.net.send({ t: 'hop', id: this.selectedBin.id, on: false });
      }
      this.selectedBin = on ? item : null;
      if (on) {
        this.dm.emit(item, 'Selected', this.openToolMouse());
        this.net.send({ t: 'hop', id: item.id, on: true });
      }
      if (this.hooks.backpackChanged) this.hooks.backpackChanged();
      return;
    }
    if (this.selectedBin) this.toggleSlot(this.selectedBin);
    if (item.parent === this.ownModel) this.net.send({ t: 'unequip', id: item.id });
    else this.net.send({ t: 'equip', id: item.id });
  }

  dropTool() {
    if (this.equippedTool && this.equippedTool.props.get('CanBeDropped')) this.net.send({ t: 'drop', id: this.equippedTool.id });
  }

  openToolMouse() {
    const m = this.dm.create('PlayerMouse', null);
    m.props.set('Name', 'Mouse');
    for (const k of ['Hit', 'Origin', 'Target', 'X', 'Y', 'ViewSizeX', 'ViewSizeY']) m.props.set(k, this.mouse.props.get(k));
    this.toolMouse = m;
    return m;
  }

  emitMouse(ev, ...args) {
    this.dm.emit(this.mouse, ev, ...args);
    if (this.toolMouse) this.dm.emit(this.toolMouse, ev, ...args);
  }

  updateMouse(ray, renderer) {
    const ignore = [];
    if (this.ownModel) ignore.push(this.ownModel);
    for (const mm of [this.mouse, this.toolMouse]) {
      const tf = mm && mm.props.get('TargetFilter');
      if (tf) ignore.push(tf);
    }
    const dir = [ray.dir[0] * 1000, ray.dir[1] * 1000, ray.dir[2] * 1000];
    const hit = this.physics.raycast(ray.origin, dir, ignore);
    const m = this.mouse;
    const o = ray.origin;
    m.props.set('Origin', C.lookAt(o[0], o[1], o[2], o[0] + ray.dir[0], o[1] + ray.dir[1], o[2] + ray.dir[2]));
    m.props.set('Hit', C.withPos(C.lookAt(o[0], o[1], o[2], hit.point[0], hit.point[1], hit.point[2]), hit.point[0], hit.point[1], hit.point[2]));
    m.props.set('Target', hit.part);
    const k = this.guiScale();
    m.props.set('X', (this.mouseState.x * k) | 0);
    m.props.set('Y', (this.mouseState.y * k) | 0);
    if (this.toolMouse) for (const key of ['Origin', 'Hit', 'Target', 'X', 'Y']) this.toolMouse.props.set(key, m.props.get(key));
    this.mouseHit = hit;
    let cd = null;
    if (hit.part && !this.mouseState.overGui) {
      cd = hit.part.findChildOfClass('ClickDetector') || (hit.part.parent && hit.part.parent.ClassName === 'Model' ? hit.part.parent.findChildOfClass('ClickDetector') : null);
      if (cd && this.own) {
        const tcf = this.own.rec.cf;
        const d = Math.hypot(hit.point[0] - tcf[0], hit.point[1] - tcf[1], hit.point[2] - tcf[2]);
        if (d > cd.props.get('MaxActivationDistance')) cd = null;
      }
    }
    if (cd !== this.mouseState.hoverCD) {
      if (this.mouseState.hoverCD && this.mouseState.hoverCD.id > 0) this.net.send({ t: 'hover', id: this.mouseState.hoverCD.id, on: false });
      if (cd && cd.id > 0) this.net.send({ t: 'hover', id: cd.id, on: true });
      this.mouseState.hoverCD = cd;
    }
    return cd;
  }

  mouseDown(button) {
    if (button !== 0) return;
    this.mouseState.down = true;
    this.mouseState.pressCD = this.mouseState.hoverCD;
    this.emitMouse('Button1Down');
    if (this.equippedTool) {
      if (this.equippedTool.props.get('Enabled')) this.dm.emit(this.equippedTool, 'Activated');
      this.sendMouse(true);
      this.net.send({ t: 'act', id: this.equippedTool.id, down: true });
    } else if (this.selectedBin) {
      this.sendMouse(true);
      this.net.send({ t: 'mouse', b: 'down', ...this.mousePayload() });
    }
  }

  mouseUp(button) {
    if (button !== 0) return;
    this.mouseState.down = false;
    this.emitMouse('Button1Up');
    if (this.equippedTool) {
      this.dm.emit(this.equippedTool, 'Deactivated');
      this.net.send({ t: 'act', id: this.equippedTool.id, down: false });
    } else if (this.selectedBin) {
      this.net.send({ t: 'mouse', b: 'up', ...this.mousePayload() });
    }
    const cd = this.mouseState.pressCD;
    if (cd && cd === this.mouseState.hoverCD && !cd.destroyed) {
      if (cd.id > 0) this.net.send({ t: 'click', id: cd.id });
      this.dm.emit(cd, 'MouseClick', this.player);
    }
    this.mouseState.pressCD = null;
  }

  mousePayload() {
    const h = this.mouse.props.get('Hit'), o = this.mouse.props.get('Origin');
    const tg = this.mouse.props.get('Target');
    return { h: [h[0], h[1], h[2]].map((v) => Math.round(v * 100) / 100), o: [o[0], o[1], o[2]].map((v) => Math.round(v * 100) / 100), tg: tg && tg.id > 0 ? tg.id : null, x: this.mouseState.x | 0, y: this.mouseState.y | 0 };
  }

  sendMouse(force) {
    if (!this.equippedTool && !this.selectedBin) return;
    if (!force && this.mouseSendAcc < 0.1) return;
    this.mouseSendAcc = 0;
    this.net.send({ t: 'mouse', ...this.mousePayload() });
  }

  keyDown(k) {
    this.keys.add(k);
    this.emitMouse('KeyDown', k);
    if ((this.equippedTool || this.selectedBin) && k.length === 1) this.net.send({ t: 'key', k, down: true });
  }

  keyUp(k) {
    this.keys.delete(k);
    this.emitMouse('KeyUp', k);
    if ((this.equippedTool || this.selectedBin) && k.length === 1) this.net.send({ t: 'key', k, down: false });
  }

  seated() {
    if (!this.own) return null;
    const torso = rootOf(this.own.model);
    if (!torso) return null;
    const ws = this.dm.services.get('Workspace');
    if (!this.own.hum.props.get('Sit')) return null;
    for (const d of ws.descendants()) {
      if (d.ClassName === 'Weld' && d.props.get('Name') === 'SeatWeld' && d.props.get('Part1') === torso) return d.props.get('Part0');
    }
    return null;
  }

  update(dt, input) {
    this.t += dt;
    this.mouseSendAcc += dt;
    const dm = this.dm;
    this.host.tick(this.t);
    const rs = dm.services.get('RunService');
    if (rs && (dm.hasListener(rs, 'RenderStepped') || dm.hasListener(rs, 'Stepped') || dm.hasListener(rs, 'Heartbeat'))) {
      dm.emit(rs, 'RenderStepped', dt);
      dm.emit(rs, 'Stepped', this.t, dt);
      dm.emit(rs, 'Heartbeat', dt);
    }
    const own = this.own;
    if (own) {
      const rec = own.rec;
      if (rec.dirty) {
        rec.dirty = false;
        rec.rig.build();
      }
      const seat = this.seated();
      if ((seat || null) !== (own.seatedOn || null)) {
        own.seatedOn = seat || null;
        dm.emit(own.hum, 'Seated', !!seat, seat || null);
      }
      if (seat) {
        if (input.jump) this.net.send({ t: 'jump' });
        if (seat.ClassName === 'VehicleSeat') {
          const th = (input.forward ? 1 : 0) - (input.back ? 1 : 0), st = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          if (!own.drive || own.drive[0] !== th || own.drive[1] !== st) {
            own.drive = [th, st];
            this.net.send({ t: 'drive', th, st });
          }
        }
        if (rec.target) rec.cf = C.lerp(rec.cf, rec.target, Math.min(1, dt * 15));
        rec.state = STATES.sit;
        own.ctrl.teleport(rec.cf);
      } else {
        let move = input.move;
        if (this.era === 2018) {
          move = this.luaMove;
          if (own.hum.props.get('Jump')) {
            input.jump = true;
            dm.setProp(own.hum, 'Jump', false);
          }
        }
        if (own.moveTo && (!move || Math.hypot(move[0], move[2]) < 1e-3)) {
          const d = [own.moveTo[0] - rec.cf[0], 0, own.moveTo[2] - rec.cf[2]];
          if (Math.hypot(d[0], d[2]) < 1.5) {
            own.moveTo = null;
            dm.emit(own.hum, 'MoveToFinished', true);
          } else move = d;
        } else if (move && Math.hypot(move[0], move[2]) > 1e-3) own.moveTo = null;
        const r = own.ctrl.update(dt, { move: move || [0, 0, 0], jump: input.jump, face: input.face });
        rec.cf = r.cf;
        rec.vel = r.vel;
        if (this.era === 2018) {
          const map = [8, 8, 3, 5, 13, 12, 15, 8];
          own.hum.data = Object.assign(own.hum.data || {}, { state: map[r.state] ?? 8 });
          const md = Math.hypot(move ? move[0] : 0, move ? move[2] : 0) > 1e-3 ? move : [0, 0, 0];
          const prevMD = own.hum.props.get('MoveDirection');
          if (!prevMD || Math.abs(prevMD[0] - md[0]) + Math.abs(prevMD[2] - md[2]) > 1e-3) dm.setProp(own.hum, 'MoveDirection', [md[0], 0, md[2]]);
        }
        if (r.state !== rec.state) {
          const prev = rec.state;
          rec.state = r.state;
          if (r.state === STATES.jump && prev !== STATES.jump) dm.emit(own.hum, 'Jumping', true);
          if (r.state === STATES.fall) dm.emit(own.hum, 'FreeFalling', true);
          if (r.state === STATES.climb) dm.emit(own.hum, 'Climbing', own.hum.props.get('WalkSpeed'));
        }
        if (r.state === STATES.walk || r.state === STATES.idle) {
          const raw = Math.hypot(r.vel[0], r.vel[2]);
          const sp = r.state === STATES.walk && raw > 0.5 ? raw : 0;
          const landed = own.runState !== r.state;
          if (landed || own.lastRun === undefined || (sp > 0) !== (own.lastRun > 0) || Math.abs(own.lastRun - sp) > 0.5) {
            own.lastRun = sp;
            dm.emit(own.hum, 'Running', sp);
          }
        }
        own.runState = r.state;
        if (rec.cf[1] < (dm.services.get('Workspace').props.get('FallenPartsDestroyHeight') || -500)) {
          own.hum.props.set('Health', 0);
        }
        this.sendAcc += dt;
        if (this.sendAcc >= 1 / SEND_HZ) {
          this.sendAcc = 0;
          this.net.send({ t: 'char', s: this.tpSeq, c: rec.cf.map((v) => Math.round(v * 1e4) / 1e4), v: r.vel.map((v) => Math.round(v * 100) / 100), st: r.state });
        }
      }
    }
    if (this.anims) this.anims.step(dt, (inst, ev, arg) => this.dm.emit(inst, ev, arg));
    for (const rec of this.chars.values()) {
      if (rec.dirty) {
        rec.dirty = false;
        rec.rig.build();
        if (rec.proxy) rec.proxy.refresh();
      }
      if (!own || rec !== own.rec) {
        rec.cf = C.lerp(rec.cf, rec.target, Math.min(1, dt * 14));
      }
      rec.t += dt;
      const speed = Math.hypot(rec.vel[0], rec.vel[2]);
      const scripted = own && rec === own.rec && rec.model.children.some((c) => c.ClassName === 'LocalScript' && c.props.get('Name') === 'Animate' && this.host.running.has(c.id));
      if (!scripted) animate(rec.model, rec.state, speed, rec.t, holdsTool(rec.model));
      stepMotors(rec.model, dt);
      const poses = rec.rig.pose(rec.cf);
      for (const [p, cf] of poses) if (p && !p.destroyed) dm.setProp(p, 'CFrame', cf, { local: true });
      if (rec.proxy) rec.proxy.update(rec.cf, poses);
    }
    this.physics.world.step();
    this.sendMouse(false);
  }

  onRemote(m) {
    const dm = this.dm;
    if (m.t === 'rfr') {
      const p = this.invokes.get(m.k | 0);
      if (!p) return;
      this.invokes.delete(m.k | 0);
      clearTimeout(p.timer);
      p.resolve(unwireArgs(dm, m.a));
      return;
    }
    const r = dm.byId.get(m.id | 0);
    if (!r) return;
    const args = unwireArgs(dm, m.a);
    if (m.t === 're' && r.ClassName === 'RemoteEvent') dm.emit(r, 'OnClientEvent', ...args);
    else if (m.t === 'rfc' && r.ClassName === 'RemoteFunction') dm.emit(r, '__Invoke', m.k | 0, ...args);
  }

  remoteAnim(m) {
    const hum = this.dm.byId.get(m.h);
    if (!this.anims || !hum || hum.ClassName !== 'Humanoid' || typeof m.k !== 'string') return;
    this.anims.op(hum, 'r' + m.k, m.op, m.id | 0, m.a, m.b, m.c, null, m.st);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  ensureAudio() {
    if (!this.audio) {
      try {
        this.audio = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.audio.createGain();
        this.master.gain.value = this.volume ?? 1;
        this.master.connect(this.audio.destination);
      } catch {
        return null;
      }
    }
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    return this.audio;
  }

  async playSound(s, op) {
    if (op === 'stop' || op === 'pause') {
      this.stopSound(s);
      return;
    }
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const url = s.props.get('SoundId');
    if (!assetId(url) && !builtin(url)) return;
    this.stopSound(s);
    const token = {};
    this.sounds.set(s, { token });
    const buf = await loadAudio(ctx, url);
    const cur = this.sounds.get(s);
    if (!buf || !cur || cur.token !== token) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!s.props.get('Looped');
    src.playbackRate.value = Math.max(0.05, s.props.get('Pitch') || 1);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, s.props.get('Volume')));
    src.connect(gain);
    let node = gain;
    if (s.parent && s.parent.isA('BasePart')) {
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 10;
      pan.rolloffFactor = 1;
      const cf = s.parent.props.get('CFrame');
      pan.positionX.value = cf[0];
      pan.positionY.value = cf[1];
      pan.positionZ.value = cf[2];
      gain.connect(pan);
      node = pan;
      cur.pan = pan;
    }
    node.connect(this.master);
    src.onended = () => {
      if (this.sounds.get(s) === cur) {
        this.sounds.delete(s);
        s.props.set('IsPlaying', false);
        this.dm.emit(s, 'Ended');
      }
    };
    src.start();
    cur.src = src;
    cur.gain = gain;
  }

  updateSound(s) {
    const cur = this.sounds.get(s);
    if (!cur || !cur.src) return;
    cur.gain.gain.value = Math.max(0, Math.min(1, s.props.get('Volume')));
    cur.src.playbackRate.value = Math.max(0.05, s.props.get('Pitch') || 1);
  }

  stopSound(s) {
    const cur = this.sounds.get(s);
    if (!cur) return;
    this.sounds.delete(s);
    try {
      if (cur.src) cur.src.stop();
    } catch {}
  }

  listener(cf) {
    if (!this.audio) return;
    const l = this.audio.listener;
    const f = C.lookVector(cf);
    if (l.positionX) {
      l.positionX.value = cf[0];
      l.positionY.value = cf[1];
      l.positionZ.value = cf[2];
      l.forwardX.value = f[0];
      l.forwardY.value = f[1];
      l.forwardZ.value = f[2];
      l.upX.value = cf[4];
      l.upY.value = cf[7];
      l.upZ.value = cf[10];
    }
    for (const [s, cur] of this.sounds) {
      if (cur.pan && s.parent && s.parent.isA('BasePart')) {
        const p = s.parent.props.get('CFrame');
        cur.pan.positionX.value = p[0];
        cur.pan.positionY.value = p[1];
        cur.pan.positionZ.value = p[2];
      }
    }
  }
}
