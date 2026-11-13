import * as C from './cframe.js';

const IDENTITY = C.cf();
const seqCache = new Map();
const HOLD_WHILE_LOADING = 3;
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
        const w = c.props.get('Weight');
        if (!(typeof w === 'number' && w <= 0)) {
          if (!keys.has(name)) keys.set(name, []);
          keys.get(name).push({ t, cf: c.props.get('CFrame') || IDENTITY, style: c.props.get('EasingStyle') | 0, dir: c.props.get('EasingDirection') | 0 });
        }
        walk(c);
      }
    };
    walk(k);
  }
  frames.sort((a, b) => a.t - b.t);
  for (const list of keys.values()) list.sort((a, b) => a.t - b.t);
  const pr = ks.props.get('Priority');
  return { loop: !!ks.props.get('Loop'), length: frames.length ? frames[frames.length - 1].t : 0, frames, keys, priority: typeof pr === 'number' ? pr : 1000 };
}

function bounceOut(x) {
  if (x < 1 / 2.75) return 7.5625 * x * x;
  if (x < 2 / 2.75) return 7.5625 * (x -= 1.5 / 2.75) * x + 0.75;
  if (x < 2.5 / 2.75) return 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375;
  return 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375;
}

function ease(style, dir, x) {
  if (style === 1) return 0;
  const f = style === 3 ? (v) => v * v * v : style === 4 ? (v) => 1 - bounceOut(1 - v) : style === 2 ? (v) => (v <= 0 || v >= 1 ? v : -Math.pow(2, 10 * (v - 1)) * Math.sin(((v - 1.075) * 2 * Math.PI) / 0.3)) : null;
  if (!f) return x;
  if (dir === 0) return f(x);
  if (dir === 1) return 1 - f(1 - x);
  return x < 0.5 ? f(x * 2) / 2 : 1 - f((1 - x) * 2) / 2;
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
      if (span <= 0) return b.cf;
      const k = ease(a.style, a.dir, (t - a.t) / span);
      return k <= 0 ? a.cf : C.lerp(a.cf, b.cf, k);
    }
  }
  return last.cf;
}

function accumulate(levels, prio, seq, t, w) {
  let lv = levels.get(prio);
  if (!lv) levels.set(prio, (lv = new Map()));
  for (const [name, list] of seq.keys) {
    const cf = sampleKeys(list, t);
    const e = lv.get(name);
    if (!e) lv.set(name, { cf, acc: w });
    else {
      e.acc += w;
      e.cf = C.lerp(e.cf, cf, w / e.acc);
    }
  }
}

function resolve(levels) {
  const out = new Map();
  for (const prio of [...levels.keys()].sort((a, b) => a - b)) {
    for (const [name, e] of levels.get(prio)) {
      const k = Math.min(1, e.acc);
      const base = out.get(name);
      out.set(name, k >= 1 ? e.cf : C.lerp(base || IDENTITY, e.cf, k));
    }
  }
  return out;
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class Animations {
  constructor(dm, loadAsset) {
    this.dm = dm;
    this.loadAsset = loadAsset;
    this.byHum = new Map();
  }

  preload(ids, onProgress) {
    const list = [...new Set((ids || []).map((v) => animAssetId(v)).filter(Boolean))];
    let done = 0;
    if (onProgress) onProgress(0, list.length);
    const one = async (id) => {
      for (let n = 0; n < 4; n++) {
        try {
          await this.sequence(id);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500 * 2 ** n));
        }
      }
      done++;
      if (onProgress) onProgress(done, list.length);
    };
    return Promise.all(list.map(one));
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

  priorityOf(tr) {
    const inst = tr.inst;
    const p = inst && !inst.destroyed ? inst.props.get('Priority') : undefined;
    if (typeof p === 'number' && (p !== 0 || !tr.seq)) return p;
    return tr.seq ? tr.seq.priority : 1000;
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
        tr = { key, id, inst, seq: null, t: 0, w: 0, target: 1, fade: 0.1, speed: 1, weight: 1, wait: 0 };
        const load = (n) => this.sequence(id).then((seq) => {
          tr.seq = seq;
          if (tr.inst && !tr.inst.destroyed) {
            tr.inst.props.set('Length', seq.length);
            if (!tr.inst.props.get('Priority')) tr.inst.props.set('Priority', seq.priority);
          }
        }).catch(() => {
          if (n >= 4 || tr.target === 0 || !an.tracks.includes(tr)) {
            tr.failed = true;
            return;
          }
          setTimeout(() => load(n + 1), 600 * 2 ** n);
        });
        load(0);
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
      const levels = new Map();
      let pending = false;
      for (const tr of an.tracks) {
        if (tr.seq || tr.failed || tr.target === 0) continue;
        tr.wait += dt;
        if (tr.wait < HOLD_WHILE_LOADING) pending = true;
      }
      for (const tr of [...an.tracks]) {
        if (tr.failed) {
          an.tracks.splice(an.tracks.indexOf(tr), 1);
          continue;
        }
        if (pending && tr.seq && tr.target === 0 && tr.w > 0) {
          const w = Math.min(1, tr.w * tr.weight);
          if (w > 0) accumulate(levels, this.priorityOf(tr), tr.seq, tr.t, w);
          continue;
        }
        if (!tr.seq && tr.target > 0) continue;
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
        accumulate(levels, this.priorityOf(tr), seq, tr.t, w);
      }
      const blend = resolve(levels);
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
