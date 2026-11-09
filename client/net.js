export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.open = false;
    this.bytesIn = 0;
    this.msgsIn = 0;
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
      ws.onmessage = (ev) => {
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
      };
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
    if (this.open && this.ws.readyState === 1) this.ws.send(s);
    else if (this.queue.length < 100) this.queue.push(s);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
