import * as C from '../shared/cframe.js';
import { applyCF } from './render.js';

const PITCH = 80 * Math.PI / 180;

export class CameraController {
  constructor(world, renderer, canvas) {
    this.world = world;
    this.renderer = renderer;
    this.canvas = canvas;
    this.yaw = 0;
    this.pitch = -0.35;
    this.zoom = 14;
    this.targetZoom = 14;
    this.dragging = false;
    this.firstPerson = false;
    this.locked = false;
    this.shiftLock = false;
    this.keyYaw = 0;
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.shiftLock) this.shiftLock = false;
    });
    this.cf = C.cf(0, 20, 20);
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2 && !this.luaDriven) {
        this.dragging = true;
        this.dragMoved = 0;
        try {
          canvas.setPointerCapture(e.pointerId);
          if (canvas.requestPointerLock) {
            const r = canvas.requestPointerLock();
            if (r && r.catch) r.catch(() => {});
          }
        } catch {}
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this.dragging) {
        this.dragging = false;
        if (document.pointerLockElement === canvas && !this.firstPerson && !this.shiftLock) document.exitPointerLock();
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (this.luaDriven) return;
      if (this.dragging || ((this.firstPerson || this.shiftLock) && document.pointerLockElement === canvas)) {
        this.yaw -= e.movementX * 0.002 * Math.PI;
        this.pitch -= e.movementY * 0.0015 * Math.PI;
        this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch));
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.luaDriven) return;
      const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100;
      if (Math.sign(e.deltaY) !== Math.sign(this.wheelAcc || 0)) this.wheelAcc = 0;
      this.wheelAcc = (this.wheelAcc || 0) + e.deltaY / unit;
      while (Math.abs(this.wheelAcc) >= 1) {
        const dir = this.wheelAcc > 0 ? -1 : 1;
        this.wheelAcc -= Math.sign(this.wheelAcc);
        this.stepZoom(dir);
      }
      if (Math.abs(e.deltaY) >= unit * 0.99) this.wheelAcc = 0;
    }, { passive: false });
  }

  shiftLockAllowed() {
    const sp = this.world.dm.services.get('StarterPlayer');
    if (sp && sp.props.get('EnableMouseLockOption') === false) return false;
    const type = this.world.camera.props.get('CameraType');
    return type !== 6 && type !== 0;
  }

  toggleShiftLock() {
    if (!this.shiftLock && !this.shiftLockAllowed()) return;
    this.shiftLock = !this.shiftLock;
    const canvas = this.canvas;
    if (this.shiftLock) {
      try {
        if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
          const r = canvas.requestPointerLock();
          if (r && r.catch) r.catch(() => {
            this.shiftLock = false;
          });
        }
      } catch {
        this.shiftLock = false;
      }
    } else if (document.pointerLockElement === canvas && !this.firstPerson && !this.dragging) document.exitPointerLock();
  }

  mouseLocked() {
    if (this.luaDriven) return !!(this.world.input2018 && this.world.input2018.behavior === 1 && document.pointerLockElement === this.canvas);
    return document.pointerLockElement === this.canvas && (this.shiftLock || this.firstPerson);
  }

  faceDir() {
    if (!this.mouseLocked()) return null;
    const type = this.world.camera.props.get('CameraType');
    if (type === 6 || type === 0) return null;
    return this.forwardFlat();
  }

  rotateBy(dx, dy) {
    this.yaw += dx * 0.86;
    this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch + dy * 0.86));
  }

  zoomBy(f) {
    this.targetZoom = Math.max(0.5, Math.min(400, this.targetZoom * f));
    this.zoom = this.targetZoom;
  }

  stepZoom(dir) {
    let z = this.targetZoom;
    if (dir > 0) z = z < 1 ? 0.5 : z / 1.25 < 1 ? 0.5 : z / 1.25;
    else z = z < 1 ? 1.25 : z * 1.25;
    z = Math.max(0.5, Math.min(400, z));
    const from = Math.max(1, this.targetZoom), to = Math.max(1, z);
    this.pitch = Math.max(-PITCH, Math.min(PITCH, this.pitch - 0.15 * Math.log(to / from)));
    this.targetZoom = z;
    this.zoom = this.targetZoom;
  }

  subjectPos() {
    const cam = this.world.camera;
    const subj = cam.props.get('CameraSubject');
    let part = null;
    let root = null;
    if (subj && !subj.destroyed) {
      if (subj.ClassName === 'Humanoid' && subj.parent) {
        root = subj.parent.findChild('HumanoidRootPart') || subj.parent.findChild('Torso');
        part = root || subj.parent.findChild('Head');
      }
      else if (subj.isA && subj.isA('BasePart')) part = subj;
      else if (subj.ClassName === 'Model') part = subj.props.get('PrimaryPart') || subj.findChildWhichIsA('BasePart');
    }
    if (!part && this.world.ownModel && !this.world.ownModel.destroyed) {
      root = this.world.ownModel.findChild('HumanoidRootPart') || this.world.ownModel.findChild('Torso');
      part = root || this.world.ownModel.findChild('Head');
    }
    if (!part) return null;
    const cf = part.props.get('CFrame');
    return [cf[0], cf[1] + (root ? 1.5 : 0), cf[2]];
  }

  forwardFlat() {
    return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
  }

  rightFlat() {
    return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
  }

  update(dt) {
    const world = this.world;
    const cam = world.camera;
    const type = cam.props.get('CameraType');
    if (this.luaDriven) {
      this.cf = cam.props.get('CFrame');
      const tc0 = this.renderer.camera;
      applyCF(tc0, this.cf);
      const fov0 = cam.props.get('FieldOfView') || 70;
      if (tc0.fov !== fov0) {
        tc0.fov = fov0;
        tc0.updateProjectionMatrix();
      }
      world.listener(this.cf);
      return;
    }
    this.yaw += this.keyYaw * dt * 2.2;
    this.zoom = this.targetZoom;
    const fp = this.zoom < 1;
    if (fp !== this.firstPerson) {
      this.firstPerson = fp;
      if (world.ownModel) for (const d of world.ownModel.descendants()) if (d.isA('BasePart')) this.renderer.setLocalTransparency(d, fp ? 1 : null);
      if (!fp && document.pointerLockElement === this.canvas && !this.dragging && !this.shiftLock) document.exitPointerLock();
    }
    if (type === 6 || type === 0) {
      this.cf = cam.props.get('CFrame');
    } else {
      const focus = this.subjectPos();
      const lockOn = !!(focus && this.shiftLock && !fp && document.pointerLockElement === this.canvas);
      this.lockBlend = (this.lockBlend || 0) + ((lockOn ? 1 : 0) - (this.lockBlend || 0)) * Math.min(1, dt * 8);
      if (!lockOn && this.lockBlend < 0.01) this.lockBlend = 0;
      if (focus && this.lockBlend > 0) {
        const rt = this.rightFlat();
        const amt = 1.75 * this.lockBlend;
        const want = [focus[0] + rt[0] * amt, focus[1], focus[2] + rt[2] * amt];
        const ignore = world.ownModel ? [world.ownModel] : [];
        const hit = world.physics.raycast(focus, [want[0] - focus[0], 0, want[2] - focus[2]], ignore, (p) => p.props.get('Transparency') < 0.95 && p.props.get('CanCollide'));
        const k = hit.part ? Math.min(1, Math.max(0, Math.hypot(hit.point[0] - focus[0], hit.point[2] - focus[2]) - 0.3) / amt) : 1;
        focus[0] += rt[0] * amt * k;
        focus[2] += rt[2] * amt * k;
      }
      if (focus) {
        const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        const back = [Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp];
        let dist = this.zoom;
        if (!fp) {
          const ignore = [];
          if (world.ownModel) ignore.push(world.ownModel);
          const hit = world.physics.raycast(focus, [back[0] * dist, back[1] * dist, back[2] * dist], ignore, (p) => p.props.get('Transparency') < 0.95 && p.props.get('CanCollide'));
          if (hit.part) {
            const d = Math.hypot(hit.point[0] - focus[0], hit.point[1] - focus[1], hit.point[2] - focus[2]);
            dist = Math.max(0.5, d - 0.5);
          }
        }
        const pos = [focus[0] + back[0] * dist, focus[1] + back[1] * dist, focus[2] + back[2] * dist];
        if (fp) {
          this.cf = C.lookAt(focus[0], focus[1], focus[2], focus[0] - back[0], focus[1] - back[1], focus[2] - back[2]);
        } else this.cf = C.lookAt(pos[0], pos[1], pos[2], focus[0], focus[1], focus[2]);
        cam.props.set('CFrame', this.cf);
        cam.props.set('Focus', C.cf(focus[0], focus[1], focus[2]));
      }
    }
    const tc = this.renderer.camera;
    applyCF(tc, this.cf);
    const fov = cam.props.get('FieldOfView') || 70;
    if (tc.fov !== fov) {
      tc.fov = fov;
      tc.updateProjectionMatrix();
    }
    world.listener(this.cf);
  }
}
