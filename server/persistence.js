import fs from 'fs';
import path from 'path';

const KINDS = ['n', 's', 'b', 'i'];
const MAX_FILE = 4 * 1024 * 1024;
const MAX_VALUE = 1024 * 1024;

function blank() {
  return { n: {}, s: {}, b: {}, i: {} };
}

export class PlayerData {
  constructor(dir, placeId, log) {
    this.dir = dir ? path.join(String(dir), 'players', String(placeId | 0)) : null;
    this.log = log || (() => {});
    this.users = new Map();
    this.timers = new Map();
  }

  file(userId) {
    return this.dir ? path.join(this.dir, `${userId | 0}.json`) : null;
  }

  load(userId) {
    userId |= 0;
    let rec = this.users.get(userId);
    if (rec) return rec.ready;
    rec = { data: blank(), ready: null };
    this.users.set(userId, rec);
    const file = this.file(userId);
    rec.ready = (async () => {
      if (!file) return rec.data;
      try {
        const st = await fs.promises.stat(file);
        if (st.size > MAX_FILE) throw new Error('data file too large');
        const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
        for (const k of KINDS) if (parsed && parsed[k] && typeof parsed[k] === 'object') rec.data[k] = parsed[k];
      } catch (e) {
        if (e.code !== 'ENOENT') this.log('warn', `Data for user ${userId} could not be read: ${e.message}`);
      }
      return rec.data;
    })();
    return rec.ready;
  }

  async get(userId, kind, key) {
    const data = await this.load(userId);
    const bag = data[kind];
    return bag && Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
  }

  async set(userId, kind, key, value) {
    if (!KINDS.includes(kind)) return;
    const data = await this.load(userId);
    if (value == null) delete data[kind][key];
    else {
      if (typeof value === 'string' && value.length > MAX_VALUE) throw new Error('Value is too large to save');
      data[kind][key] = value;
    }
    this.schedule(userId);
  }

  complexity(userId) {
    const rec = this.users.get(userId | 0);
    if (!rec) return 0;
    let n = 0;
    for (const k of KINDS) for (const [key, v] of Object.entries(rec.data[k])) n += key.length + (typeof v === 'string' ? v.length : 8);
    return n;
  }

  schedule(userId, ms = 1500) {
    if (!this.dir || this.timers.has(userId)) return;
    this.timers.set(userId, setTimeout(() => {
      this.timers.delete(userId);
      this.write(userId);
    }, ms));
  }

  write(userId) {
    const rec = this.users.get(userId);
    const file = this.file(userId);
    if (!rec || !file) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rec.data));
      fs.renameSync(tmp, file);
    } catch (e) {
      this.log('warn', `Data for user ${userId} could not be saved: ${e.message}`);
    }
  }

  release(userId, ms = 8000) {
    userId |= 0;
    setTimeout(() => {
      if (this.timers.has(userId)) {
        clearTimeout(this.timers.get(userId));
        this.timers.delete(userId);
        this.write(userId);
      }
      if (this.keep && this.keep(userId)) return;
      this.users.delete(userId);
    }, ms);
  }

  flushAll() {
    for (const [userId, t] of this.timers) {
      clearTimeout(t);
      this.write(userId);
    }
    this.timers.clear();
  }
}
