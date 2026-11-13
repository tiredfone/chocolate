import * as C from './cframe.js';

const IDENTITY = C.cf();
const seqCache = new Map();
const OPS = new Set(['play', 'stop', 'speed', 'weight', 'time']);

export function animAssetId(url) {
  if (typeof url === 'number') return url > 0 ? url : null;
  const s = String(url || '').trim();
  const m = /[?&]id=(\d+)/i.exec(s) || /^rbxassetid:\/\/(\d+)/i.exec(s) || /^(\d+)$/.exec(s);
  return m ? +m[1] : null;
}

export function parseSequence(ks) {
  const frames = [];
  const keys = new Map();
  for (const k of ks.children) {
    if (k.ClassName !== 'Keyframe') continue;
    const t = Number(k.props.get('Time')) || 0;
    frames.push({ t, name: String(k.props.get('Name')) });
    const walk = (p) => {
      for (const c of p.children) {
        if (c.ClassName !== 'Pose') continue;
        const name = String(c.props.get('Name'));
        if (!keys.has(name)) keys.set(name, []);
        keys.get(name).push({ t, cf: c.props.get('CFrame') || IDENTITY });
        walk(c);
      }
    };
    walk(k);
  }
  frames.sort((a, b) => a.t - b.t);
  for (const list of keys.values()) list.sort((a, b) => a.t - b.t);
  return { loop: !!ks.props.get('Loop'), length: frames.length ? frames[frames.length - 1].t : 0, frames, keys };
}

function sampleKeys(list, t) {
  if (t <= list[0].t) return list[0].cf;
  const last = list[list.length - 1];
  if (t >= last.t) return last.cf;
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (t <= b.t) {
      const a = list[i - 1];
      const span = b.t - a.t;
      return span > 0 ? C.lerp(a.cf, b.cf, (t - a.t) / span) : b.cf;
    }
  }
  return last.cf;
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class Animations {
  constructor(dm, loadAsset) {
    this.dm = dm;
    this.loadAsset = loadAsset;
    this.byHum = new Map();
  }

  sequence(id) {
    if (seqCache.has(id)) return seqCache.get(id);
    const p = this.loadAsset(id).then((model) => {
      const ks = model.ClassName === 'KeyframeSequence' ? model : model.descendants().find((d) => d.ClassName === 'KeyframeSequence');
      const seq = ks ? parseSequence(ks) : null;
      if (!model.destroyed) this.dm.destroy(model, true);
      if (!seq) throw new Error(`asset ${id} has no KeyframeSequence`);
      return seq;
    });
    seqCache.set(id, p);
    p.catch(() => seqCache.delete(id));
    if (seqCache.size > 300) seqCache.delete(seqCache.keys().next().value);
    return p;
  }

  trackOf(inst) {
    const hum = inst && inst.data && inst.data.hum;
    const an = hum && this.byHum.get(hum);
    return an ? an.tracks.find((t) => t.inst === inst) || null : null;
  }

  static validOp(op) {
    return OPS.has(op);
  }

  op(hum, key, op, id, a, b, c, inst = null, start = 0) {
    if (!hum || hum.destroyed || !OPS.has(op)) return;
    let an = this.byHum.get(hum);
    if (!an) {
      if (op !== 'play') return;
      an = { tracks: [], joints: new Set() };
      this.byHum.set(hum, an);
    }
    let tr = an.tracks.find((x) => x.key === key);
    if (op === 'play') {
      if (!id) return;
      if (!tr || tr.id !== id) {
        if (tr) an.tracks.splice(an.tracks.indexOf(tr), 1);
        tr = { key, id, inst, seq: null, t: 0, w: 0, target: 1, fade: 0.1, speed: 1, weight: 1 };
        this.sequence(id).then((seq) => {
          tr.seq = seq;
          if (tr.inst && !tr.inst.destroyed) tr.inst.props.set('Length', seq.length);
        }).catch(() => { tr.failed = true; });
      } else {
        an.tracks.splice(an.tracks.indexOf(tr), 1);
      }
      an.tracks.push(tr);
      tr.t = Math.max(0, num(start, 0));
      tr.target = 1;
      tr.fade = Math.max(0, num(a, 0.1));
      tr.weight = Math.max(0, num(b, 1));
      tr.speed = num(c, 1);
      if (tr.fade === 0) tr.w = 1;
      if (inst && !inst.destroyed) inst.props.set('IsPlaying', true);
      return;
    }
    if (!tr) return;
    if (op === 'stop') {
      tr.target = 0;
      tr.fade = Math.max(0, num(a, 0.1));
      if (tr.fade === 0) tr.w = 0;
    } else if (op === 'speed') tr.speed = num(a, 1);
    else if (op === 'time') tr.t = Math.max(0, num(a, 0));
    else if (op === 'weight') {
      tr.weight = Math.max(0, num(a, 1));
      tr.fade = Math.max(0, num(b, 0.1));
    }
  }

  playing(hum) {
    const an = this.byHum.get(hum);
    return an ? an.tracks.filter((t) => t.inst && t.target > 0).map((t) => t.inst) : [];
  }

  snapshot() {
    const out = [];
    for (const [hum, an] of this.byHum) for (const tr of an.tracks) if (tr.target > 0 && hum.id > 0) out.push({ h: hum.id, k: tr.key, id: tr.id, a: 0, b: tr.weight, c: tr.speed, st: tr.t });
    return out;
  }

  dropKeys(prefix) {
    for (const an of this.byHum.values()) for (const tr of an.tracks) if (tr.key.startsWith(prefix)) tr.target = 0;
  }

  step(dt, emit) {
    for (const [hum, an] of this.byHum) {
      const model = hum.parent;
      if (hum.destroyed || !model) {
        for (const j of an.joints) j.anim = null;
        this.byHum.delete(hum);
        continue;
      }
      const blend = new Map();
      for (const tr of [...an.tracks]) {
        if (tr.failed) {
          an.tracks.splice(an.tracks.indexOf(tr), 1);
          continue;
        }
        const rate = tr.fade > 0 ? dt / tr.fade : Infinity;
        tr.w = tr.target > tr.w ? Math.min(tr.target, tr.w + rate) : Math.max(tr.target, tr.w - rate);
        if (tr.target === 0 && tr.w <= 0) {
          an.tracks.splice(an.tracks.indexOf(tr), 1);
          if (tr.inst && !tr.inst.destroyed) {
            tr.inst.props.set('IsPlaying', false);
            if (emit) emit(tr.inst, 'Stopped');
          }
          continue;
        }
        const seq = tr.seq;
        if (!seq) continue;
        const prev = tr.t;
        let now = prev + dt * tr.speed;
        const len = seq.length;
        const reached = [];
        if (tr.target > 0) {
          if (len > 0 && now >= len) {
            for (const f of seq.frames) if (f.t > prev && f.t <= len) reached.push(f.name);
            if (seq.loop) {
              now %= len;
              for (const f of seq.frames) if (f.t <= now) reached.push(f.name);
            } else {
              now = len;
              tr.target = 0;
              tr.fade = 0;
              tr.w = 0;
            }
          } else {
            for (const f of seq.frames) if (f.t > prev && f.t <= now) reached.push(f.name);
          }
        }
        tr.t = now;
        if (tr.inst && emit) for (const n of reached) if (n !== 'Keyframe' && !tr.inst.destroyed) emit(tr.inst, 'KeyframeReached', n);
        const w = Math.min(1, tr.w * tr.weight);
        if (w <= 0) continue;
        for (const [name, list] of seq.keys) {
          const cf = sampleKeys(list, tr.t);
          const base = blend.get(name) || IDENTITY;
          blend.set(name, w >= 1 ? cf : C.lerp(base, cf, w));
        }
      }
      const used = new Set();
      if (blend.size) {
        for (const d of model.descendants()) {
          if (!d.isA('JointInstance')) continue;
          const p1 = d.props.get('Part1');
          const cf = p1 ? blend.get(p1.props.get('Name')) : null;
          if (cf) {
            d.anim = cf;
            used.add(d);
          }
        }
      }
      for (const j of an.joints) if (!used.has(j)) j.anim = null;
      an.joints = used;
      if (!an.tracks.length) this.byHum.delete(hum);
    }
  }
}
