import { REPLICATED_SERVICES } from '../shared/classes.js';
import { encodeInst, encodeValue, hiddenProp } from '../shared/codec.js';

const PHYS_PROPS = new Set(['CFrame', 'Velocity', 'RotVelocity']);
const LOCAL_ONLY = new Set(['CurrentAngle', 'DesiredAngle', 'MaxVelocity']);
const R = (v) => Math.round(v * 1000) / 1000;

export class Replicator {
  constructor(dm) {
    this.dm = dm;
    this.clients = new Map();
    this.ops = [];
    this.newSet = new Set();
    this.propKeys = new Set();
    this.replicatedRoots = new Set();
    for (const n of REPLICATED_SERVICES) {
      const s = dm.service(n);
      if (s) this.replicatedRoots.add(s);
    }
    for (const r of this.replicatedRoots) this.markSubtree(r, { rep: true, scope: null });
    dm.observe(this);
  }

  addClient(cid, player, send) {
    this.clients.set(cid, { cid, player, send, ready: false });
  }

  removeClient(cid) {
    this.clients.delete(cid);
  }

  repState(inst) {
    let scope = null;
    for (let x = inst; x; x = x.parent) {
      if (x.parent === this.dm.root) return this.replicatedRoots.has(x) ? { rep: true, scope } : { rep: false };
      if ((x.ClassName === 'PlayerGui' || x.ClassName === 'Backpack' || x.ClassName === 'PlayerScripts' || x.ClassName === 'StarterGear') && x.parent && x.parent.ClassName === 'Player') scope = x.parent;
      if (x === this.dm.root) return { rep: false };
    }
    return { rep: false };
  }

  visible(state, client) {
    return state.rep && (!state.scope || state.scope === client.player);
  }

  reparented(inst, old) {
    const prev = inst.repWas || { rep: false };
    const now = this.repState(inst);
    if (!prev.rep && !now.rep) return;
    this.ops.push({ k: 'move', inst, prev, now });
    this.markSubtree(inst, now);
  }

  markSubtree(inst, state) {
    inst.repWas = state;
    for (const c of inst.children) {
      const scoped = (c.ClassName === 'PlayerGui' || c.ClassName === 'Backpack' || c.ClassName === 'PlayerScripts' || c.ClassName === 'StarterGear') && inst.ClassName === 'Player';
      this.markSubtree(c, scoped ? { rep: state.rep, scope: inst } : state);
    }
  }

  changed(inst, name, old, opts) {
    if (!inst.repWas || !inst.repWas.rep) return;
    if (opts && opts.local) return;
    if (LOCAL_ONLY.has(name)) return;
    if (opts && opts.physics && PHYS_PROPS.has(name)) return;
    if (hiddenProp(inst, name)) return;
    if (opts && opts.op && inst.ClassName.includes('Sound')) {
      this.ops.push({ k: 'snd', inst, op: opts.op });
      return;
    }
    const key = inst.id + ':' + name;
    if (this.propKeys.has(key)) return;
    this.propKeys.add(key);
    this.ops.push({ k: 'p', inst, name });
  }

  destroyed(inst) {
    if (inst.repWas && inst.repWas.rep) this.ops.push({ k: 'del', id: inst.id, prev: inst.repWas });
    inst.repWas = { rep: false };
  }

  snapshotFor(client) {
    const out = [];
    const walk = (x, scope) => {
      let s = scope;
      if ((x.ClassName === 'PlayerGui' || x.ClassName === 'Backpack' || x.ClassName === 'PlayerScripts' || x.ClassName === 'StarterGear') && x.parent && x.parent.ClassName === 'Player') s = x.parent;
      if (s && s !== client.player) return;
      out.push(encodeInst(x));
      x.repWas = { rep: true, scope: s };
      for (const c of x.children) walk(c, s);
    };
    for (const root of this.replicatedRoots) walk(root, null);
    return out;
  }

  subtreeFor(inst, client) {
    const out = [];
    const walk = (x, scope) => {
      let s = scope;
      if ((x.ClassName === 'PlayerGui' || x.ClassName === 'Backpack' || x.ClassName === 'PlayerScripts' || x.ClassName === 'StarterGear') && x.parent && x.parent.ClassName === 'Player') s = x.parent;
      if (s && s !== client.player) return;
      out.push(encodeInst(x));
      for (const c of x.children) walk(c, s);
    };
    const st = this.repState(inst);
    walk(inst, st.scope || null);
    return out;
  }

  flush(extraFor) {
    const ops = this.ops;
    this.ops = [];
    this.propKeys.clear();
    for (const client of this.clients.values()) {
      if (!client.ready) continue;
      const msg = { t: 'rep', o: [] };
      const o = msg.o;
      for (const op of ops) {
        if (op.k === 'p') {
          const inst = op.inst;
          if (inst.destroyed || !inst.repWas || !this.visible(inst.repWas, client)) continue;
          const p = inst.info.all.get(op.name);
          if (!p) continue;
          const v = encodeValue(p.type, inst.props.get(op.name));
          if (v === undefined) continue;
          o.push(['p', inst.id, op.name, v]);
        } else if (op.k === 'move') {
          const inst = op.inst;
          if (inst.destroyed) {
            if (this.visible(op.prev, client)) o.push(['d', inst.id]);
            continue;
          }
          const knew = this.visible(op.prev, client);
          const sees = this.visible(this.repState(inst), client);
          if (knew && sees) o.push(['m', inst.id, inst.parent ? inst.parent.id : null]);
          else if (!knew && sees) o.push(['n', this.subtreeFor(inst, client)]);
          else if (knew && !sees) o.push(['d', inst.id]);
        } else if (op.k === 'del') {
          if (this.visible(op.prev, client)) o.push(['d', op.id]);
        } else if (op.k === 'snd') {
          if (op.inst.repWas && this.visible(op.inst.repWas, client)) o.push(['s', op.inst.id, op.op]);
        }
      }
      if (extraFor) extraFor(client, msg);
      if (o.length || msg.ph || msg.ch || msg.after) client.send(JSON.stringify(msg));
    }
  }

  static physRecord(part) {
    const cf = part.props.get('CFrame');
    const v = part.props.get('Velocity');
    return [part.id, R(cf[0]), R(cf[1]), R(cf[2]), R(cf[3]), R(cf[4]), R(cf[5]), R(cf[6]), R(cf[7]), R(cf[8]), R(cf[9]), R(cf[10]), R(cf[11]), R(v[0]), R(v[1]), R(v[2])];
  }
}
