import * as THREE from 'three';
import { GidMap, unpack, packSubtree, encodeProp, decodeProp, canMove, FLUSH_MS, MAX_XML } from '../shared/teamsync.js';
import { endpointUrl } from '../client/assets.js';
import { el } from './ui.js';
import { partsOf } from './view.js';

const BATCH_BYTES = 4 * 1024 * 1024;

function wsUrl(path) {
  if (/^wss?:\/\//.test(path)) return path;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export async function connectTeam(cfg) {
  const url = endpointUrl('studioTicket', cfg.placeId);
  if (!url) return null;
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': cfg.csrf || '' },
    body: '{}',
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ticket) throw new Error((j && j.error) || 'Team Create is not available');
  const base = wsUrl(j.ws || cfg.ticketWs || '/chocolate/ws');
  const ws = new WebSocket(`${base}${base.includes('?') ? '&' : '?'}ticket=${j.ticket}`);
  return new Promise((resolve, reject) => {
    const early = [];
    let snap = null;
    const fail = (e) => {
      clearTimeout(timer);
      if (!snap) reject(e);
    };
    const timer = setTimeout(() => {
      fail(new Error('Team Create did not answer'));
      ws.close();
    }, 90000);
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (snap) {
        early.push(m);
        return;
      }
      if (m.t === 'snap') {
        snap = m;
        clearTimeout(timer);
        resolve({ ws, snap, early });
      } else if (m.t === 'err' || m.t === 'kick') fail(new Error(m.m || 'Team Create refused the connection'));
    };
    ws.onerror = () => fail(new Error('Could not reach the Team Create server'));
    ws.onclose = () => fail(new Error('The Team Create server closed the connection'));
  });
}

export function loadSnapshot(dm, snap) {
  const gids = new GidMap(dm, snap.prefix);
  unpack(dm, gids, snap.xml, snap.refs, dm.root);
  for (const d of dm.root.descendants()) if (!d.gid) gids.mint(d);
  return gids;
}

export class TeamSync {
  constructor(app, conn, gids) {
    this.app = app;
    this.dm = app.dm;
    this.ws = conn.ws;
    this.gids = gids;
    this.me = conn.snap.you;
    this.role = conn.snap.role;
    this.users = conn.snap.users || [];
    this.seq = 0;
    this.props = new Map();
    this.moves = new Map();
    this.news = new Set();
    this.lastSent = new Map();
    this.applying = false;
    this.open = true;
    this.remoteSel = new Map();
    this.selBoxes = new Map();
    this.selDirty = false;
    this.mat = new Map();
    const self = this;
    this.dm.observe({
      changed(inst, name) {
        if (self.applying || name === 'Parent' || !inst.gid || !inst.info.all.has(name)) return;
        self.props.set(inst.gid + '\n' + name, { inst, name });
      },
      reparented(inst) {
        if (self.applying) return;
        if (inst.gid) self.moves.set(inst.gid, inst);
        else if (inst.parent) self.news.add(inst);
      },
    });
    this.ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(m);
    };
    this.ws.onclose = () => this.lost();
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    this.selTimer = setInterval(() => this.drawRemoteSelections(), 400);
    this.buildPane();
    const save = app.save.bind(app);
    app.save = async () => {
      this.flush();
      const ok = await save();
      if (ok) this.send({ t: 'saved' });
      return ok;
    };
    const selChanged = app.selectionChanged.bind(app);
    app.selectionChanged = () => {
      selChanged();
      this.selDirty = true;
    };
    for (const m of conn.early) this.handle(m);
    if (conn.snap.dirty) app.markDirty();
    const others = this.users.length - 1;
    app.print(others > 0 ? `Team Create: editing with ${others} other ${others === 1 ? 'person' : 'people'}` : 'Team Create: you are the only editor right now', 'info');
  }

  send(obj) {
    if (this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  flush() {
    if (!this.open) return;
    const ops = [];
    const tops = [];
    for (const inst of this.news) {
      if (inst.destroyed || inst.gid) continue;
      let top = inst;
      while (top.parent && !top.parent.gid) top = top.parent;
      if (!top.parent || top.parent === this.dm.root || tops.includes(top)) continue;
      tops.push(top);
    }
    this.news.clear();
    for (const top of tops) {
      const pk = packSubtree(this.dm, this.gids, [top]);
      if (pk.xml.length > MAX_XML) {
        this.app.print(`Team Create: ${top.props.get('Name')} is too large to share and only exists on your screen`, 'err');
        continue;
      }
      ops.push({ t: 'n', s: ++this.seq, p: top.parent.gid, xml: pk.xml, refs: pk.refs });
    }
    for (const [gid, inst] of this.moves) {
      const p = inst.parent;
      if (p && !p.gid) continue;
      const s = ++this.seq;
      ops.push({ t: 'm', s, g: gid, p: p ? p.gid : null });
      this.lastSent.set('m:' + gid, s);
    }
    this.moves.clear();
    for (const [key, { inst, name }] of this.props) {
      const v = encodeProp(inst, name);
      if (v === undefined) continue;
      const s = ++this.seq;
      ops.push({ t: 'p', s, g: inst.gid, n: name, v });
      this.lastSent.set(key, s);
    }
    this.props.clear();
    if (this.selDirty) {
      this.selDirty = false;
      ops.push({ t: 'sel', g: [...this.app.selection].map((i) => i.gid).filter(Boolean).slice(0, 200) });
    }
    if (!ops.length) return;
    let batch = [], size = 0;
    for (const op of ops) {
      const n = op.xml ? op.xml.length : 200;
      if (batch.length && size + n > BATCH_BYTES) {
        this.send({ t: 'b', ops: batch });
        batch = [];
        size = 0;
      }
      batch.push(op);
      size += n;
    }
    if (batch.length) this.send({ t: 'b', ops: batch });
  }

  ownStale(key, s, u) {
    if (u !== this.me) return false;
    if (this.props.has(key) || (key.startsWith('m:') && this.moves.has(key.slice(2)))) return true;
    const last = this.lastSent.get(key);
    return last != null && last > s;
  }

  apply(fn) {
    this.applying = true;
    try {
      fn();
    } finally {
      this.applying = false;
    }
  }

  handle(m) {
    switch (m.t) {
      case 'p': {
        const key = m.g + '\n' + m.n;
        if (this.ownStale(key, m.s, m.u)) return;
        const inst = this.gids.get(m.g);
        if (!inst) return;
        const d = decodeProp(this.gids, inst, m.n, m.v);
        if (!d.ok) return;
        this.apply(() => this.dm.setProp(inst, m.n, d.v));
        (inst.dirtyProps ||= new Set()).add(m.n);
        if (m.u !== this.me) this.app.markDirty();
        if (m.n === 'Source') {
          const doc = this.app.docs.get('script:' + inst.id);
          if (doc) doc.ed.reload();
        }
        break;
      }
      case 'm': {
        if (this.ownStale('m:' + m.g, m.s, m.u)) return;
        const inst = this.gids.get(m.g);
        const parent = m.p == null ? null : this.gids.get(m.p);
        if (!inst || (m.p != null && !parent) || !canMove(inst, parent, this.dm.root) || inst.parent === parent) return;
        this.apply(() => {
          inst.parentLocked = false;
          this.dm.setParent(inst, parent);
        });
        if (m.u !== this.me) this.app.markDirty();
        break;
      }
      case 'n': {
        if (m.u === this.me) return;
        const parent = this.gids.get(m.p);
        if (!parent) return;
        this.apply(() => unpack(this.dm, this.gids, m.xml, m.refs, parent));
        this.app.markDirty();
        break;
      }
      case 'nack':
        this.app.print(`Team Create did not accept one of your changes (${m.m}). Reload Studio if the place looks different for others.`, 'err');
        break;
      case 'users': {
        this.users = m.users || [];
        if (m.joined) this.app.print(`${m.joined.name} joined Team Create`, 'info');
        if (m.left) this.app.print(`${m.left.name} left Team Create`, 'info');
        const live = new Set(this.users.map((u) => u.cid));
        for (const k of [...this.remoteSel.keys()]) if (!live.has(k)) this.remoteSel.delete(k);
        this.drawUsers();
        break;
      }
      case 'sel':
        this.remoteSel.set(m.u, (m.g || []).map((g) => this.gids.get(g)).filter(Boolean));
        break;
      case 'chat':
        this.chatLine(m.name, m.m, m.color);
        break;
      case 'saved':
        this.app.dirty = false;
        this.app.ui.setTitle(`${this.app.cfg.placeName || 'Place'} - Studio`);
        this.app.print(`${m.name} saved the place`, 'info');
        break;
      default:
        break;
    }
  }

  lost() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.timer);
    this.status.textContent = 'Disconnected';
    this.status.className = 'st-team-status off';
    this.app.print('Lost the connection to Team Create. Changes you make now are not shared. Save to keep them, or reload Studio to rejoin.', 'err');
    this.app.ui.alert('Team Create', 'The connection to Team Create was lost. Changes you make now are not shared with other editors. Save to keep your copy, or reload Studio to rejoin.');
  }

  colorOf(cid) {
    const u = this.users.find((x) => x.cid === cid);
    return u ? u.color : '#888';
  }

  drawRemoteSelections() {
    const scene = this.app.r.scene;
    for (const [cid, box] of this.selBoxes) {
      scene.remove(box);
      box.geometry.dispose();
    }
    this.selBoxes.clear();
    for (const [cid, list] of this.remoteSel) {
      const parts = list.filter((i) => i.parent && !i.destroyed).flatMap((i) => partsOf(i)).slice(0, 400);
      if (!parts.length) continue;
      const color = this.colorOf(cid);
      let mat = this.mat.get(color);
      if (!mat) {
        mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
        this.mat.set(color, mat);
      }
      const box = this.app.view.boxLines(parts, mat);
      box.renderOrder = 997;
      scene.add(box);
      this.selBoxes.set(cid, box);
    }
  }

  buildPane() {
    const body = this.app.ui.addPane('team', 'Team Create', 'right');
    const box = el('div', 'st-team', body);
    this.status = el('div', 'st-team-status', box, 'Connected');
    el('div', 'st-team-head', box, 'Editing now');
    this.userList = el('div', 'st-team-users', box);
    el('div', 'st-team-head', box, 'Collaborators');
    this.collabList = el('div', 'st-team-users', box);
    if (this.role === 'owner') {
      const row = el('div', 'st-team-add', box);
      const input = el('input', null, row);
      input.type = 'text';
      input.placeholder = 'Username';
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') add();
      });
      const btn = el('button', null, row, 'Add');
      const add = async () => {
        const name = input.value.trim();
        if (!name) return;
        if (await this.collab('add', name)) input.value = '';
      };
      btn.addEventListener('click', add);
    }
    el('div', 'st-team-head', box, 'Chat');
    this.chatLog = el('div', 'st-team-chat', box);
    const chat = el('input', 'st-team-say', box);
    chat.type = 'text';
    chat.maxLength = 200;
    chat.placeholder = 'Say something to other editors';
    chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && chat.value.trim()) {
        this.send({ t: 'chat', m: chat.value.trim() });
        chat.value = '';
      }
    });
    this.drawUsers();
    this.collab();
    this.app.ui.layout();
  }

  drawUsers() {
    if (!this.userList) return;
    this.userList.replaceChildren();
    for (const u of this.users) {
      const r = el('div', 'st-team-user', this.userList);
      const dot = el('span', 'st-team-dot', r);
      dot.style.background = u.color;
      el('span', null, r, u.name + (u.cid === this.me ? ' (you)' : '') + (u.role === 'owner' ? ' - owner' : ''));
    }
  }

  async collab(action, username) {
    const url = endpointUrl('studioCollaborators', this.app.cfg.placeId);
    if (!url) return false;
    const opts = action
      ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.app.cfg.csrf || '' }, body: JSON.stringify({ action, username }) }
      : { credentials: 'same-origin', cache: 'no-store' };
    const r = await fetch(url, opts).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j || !j.success) {
      this.app.print(`Collaborators: ${(j && j.error) || 'request failed'}`, 'err');
      return false;
    }
    this.collabList.replaceChildren();
    if (j.owner) el('div', 'st-team-user', this.collabList, `${j.owner.name} - owner`);
    if (!j.collaborators.length) el('div', 'st-team-none', this.collabList, this.role === 'owner' ? 'Add people by username so they can edit this place with you.' : 'No other collaborators.');
    for (const c of j.collaborators) {
      const r2 = el('div', 'st-team-user', this.collabList);
      el('span', null, r2, c.name);
      if (this.role === 'owner') {
        const x = el('span', 'st-team-x', r2, '×');
        x.title = 'Remove';
        x.addEventListener('click', () => this.collab('remove', c.name));
      }
    }
    if (action) this.app.print(`${action === 'add' ? 'Added' : 'Removed'} ${username}`, 'info');
    return true;
  }

  chatLine(name, text, color) {
    const r = el('div', 'st-team-line', this.chatLog);
    const n = el('b', null, r, name + ': ');
    n.style.color = color || '#15428b';
    r.append(text);
    while (this.chatLog.children.length > 200) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
}
