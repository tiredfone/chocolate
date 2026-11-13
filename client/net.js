export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.open = false;
    this.bytesIn = 0;
    this.msgsIn = 0;
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    this.lag = q && q.get('netsim') === '1' && typeof window !== 'undefined' && window.parent !== window ? { base: 110, jitter: 70, inAt: 0, outAt: 0 } : null;
  }

  delayed(dir, fn) {
    const l = this.lag;
    if (!l) return fn();
    const now = performance.now();
    const key = dir === 'in' ? 'inAt' : 'outAt';
    const at = Math.max(l[key], now + l.base + Math.random() * l.jitter);
    l[key] = at;
    setTimeout(fn, at - now);
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        this.open = true;
        for (const m of this.queue.splice(0)) ws.send(m);
        settled = true;
        resolve();
      };
      ws.onmessage = (ev) => this.delayed('in', () => {
        this.bytesIn += ev.data.length;
        this.msgsIn++;
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        const h = this.handlers.get(m.t);
        if (h) {
          try {
            h(m);
          } catch (e) {
            console.error('handler', m.t, e);
          }
        }
      });
      ws.onclose = (ev) => {
        this.open = false;
        const h = this.handlers.get('close');
        if (h) h(ev);
        if (!settled) reject(new Error('connection closed (' + ev.code + ')'));
      };
      ws.onerror = () => {};
    });
  }

  send(obj) {
    const s = JSON.stringify(obj);
    if (this.lag && this.open) return this.delayed('out', () => this.ws.readyState === 1 && this.ws.send(s));
    if (this.open && this.ws.readyState === 1) this.ws.send(s);
    else if (this.queue.length < 100) this.queue.push(s);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
