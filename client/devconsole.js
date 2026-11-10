const MAX_LINES = 2000;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function stamp() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export class DevConsole {
  constructor(parent) {
    this.logs = { client: [], server: [] };
    this.tab = 'client';
    this.filter = { print: true, warn: true, error: true };
    this.query = '';
    this.open = false;
    this.serverSeen = false;
    this.el = el('section', 'ch-dev', parent);
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Developer Console');
    const head = el('header', 'ch-dev-head', this.el);
    el('h2', 'ch-dev-title', head, 'Developer Console');
    this.tabs = {};
    const tabs = el('div', 'ch-dev-tabs', head);
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [['client', 'Client Log'], ['server', 'Server Log']]) {
      const b = el('button', 'ch-dev-tab', tabs, label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => this.show(id));
      this.tabs[id] = b;
    }
    const close = el('button', 'ch-dev-close', head, '×');
    close.type = 'button';
    close.title = 'Close (F9)';
    close.setAttribute('aria-label', 'Close developer console');
    close.addEventListener('click', () => this.toggle(false));
    const bar = el('div', 'ch-dev-bar', this.el);
    this.counts = {};
    for (const [k, label] of [['print', 'Output'], ['warn', 'Warnings'], ['error', 'Errors']]) {
      const lab = el('label', 'ch-dev-filter ch-dev-' + k, bar);
      const cb = el('input', null, lab);
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', () => {
        this.filter[k] = cb.checked;
        this.render();
      });
      el('span', null, lab, label);
      this.counts[k] = el('b', 'ch-dev-count', lab, '0');
    }
    this.search = el('input', 'ch-dev-search', bar);
    this.search.type = 'search';
    this.search.placeholder = 'Search';
    this.search.setAttribute('aria-label', 'Search the log');
    this.search.addEventListener('input', () => {
      this.query = this.search.value.toLowerCase();
      this.render();
    });
    this.search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'F9') {
        e.preventDefault();
        this.toggle(false);
      }
    });
    const clear = el('button', 'ch-dev-clear', bar, 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      this.logs[this.tab] = [];
      this.render();
    });
    this.list = el('div', 'ch-dev-list', this.el);
    this.list.setAttribute('role', 'log');
    this.list.tabIndex = 0;
    this.empty = el('p', 'ch-dev-empty', this.el);
    for (const ev of ['pointerdown', 'wheel', 'touchstart', 'contextmenu']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.show('client');
  }

  add(source, kind, msg) {
    const k = kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : 'print';
    const list = this.logs[source];
    if (!list) return;
    if (source === 'server') this.serverSeen = true;
    const entry = { k, t: stamp(), m: String(msg) };
    list.push(entry);
    if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES);
    if (!this.open || source !== this.tab) return;
    if (!this.visible(entry)) {
      this.updateCounts();
      return;
    }
    const nearBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;
    this.list.appendChild(this.row(entry));
    while (this.list.childElementCount > MAX_LINES) this.list.firstElementChild.remove();
    this.empty.hidden = true;
    this.list.hidden = false;
    this.updateCounts();
    if (nearBottom) this.list.scrollTop = this.list.scrollHeight;
  }

  visible(e) {
    return this.filter[e.k] && (!this.query || e.m.toLowerCase().includes(this.query));
  }

  row(e) {
    const r = el('div', 'ch-dev-line ch-dev-' + e.k);
    el('span', 'ch-dev-time', r, e.t);
    el('span', 'ch-dev-msg', r, e.m);
    return r;
  }

  updateCounts() {
    const list = this.logs[this.tab];
    for (const k of ['print', 'warn', 'error']) this.counts[k].textContent = String(list.filter((e) => e.k === k).length);
  }

  render() {
    const list = this.logs[this.tab];
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const e of list) {
      if (!this.visible(e)) continue;
      frag.appendChild(this.row(e));
      n++;
    }
    this.list.replaceChildren(frag);
    this.updateCounts();
    this.empty.hidden = n > 0;
    this.list.hidden = n === 0;
    this.empty.textContent = list.length
      ? 'Nothing matches the current filters.'
      : this.tab === 'server' && !this.serverSeen
        ? 'Server output is shown to the game’s owner and developers.'
        : 'Nothing has been logged yet.';
    this.list.scrollTop = this.list.scrollHeight;
  }

  show(tab) {
    this.tab = tab;
    for (const [id, b] of Object.entries(this.tabs)) {
      b.classList.toggle('on', id === tab);
      b.setAttribute('aria-selected', id === tab ? 'true' : 'false');
    }
    this.render();
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    if (on) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.render();
    } else if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
  }
}
