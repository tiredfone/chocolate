import { instrumentChecked } from '../shared/debugger.js';
import { writePlace } from '../shared/rbxlx.js';
import { el } from './ui.js';

const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);

export class Debugger {
  constructor(app) {
    this.app = app;
    this.bps = new Map();
    this.watches = [];
    this.mode = 'unhandled';
    this.paused = null;
    this.sids = new Map();
    this.sidOf = new Map();
    this.lastError = null;
    this.panes = {};
    window.addEventListener('message', (e) => this.onFrame(e));
  }

  linesOf(script) {
    return this.bps.get(script) || new Set();
  }

  toggle(script, line) {
    let set = this.bps.get(script);
    if (!set) this.bps.set(script, (set = new Set()));
    if (set.has(line)) set.delete(line);
    else set.add(line);
    if (!set.size) this.bps.delete(script);
    this.sendBreakpoints();
    this.refreshEditors();
    this.renderBreakpoints();
  }

  refreshEditors() {
    for (const d of this.app.docs.values()) if (d.script && d.ed.setMarks) d.ed.setMarks(this.linesOf(d.script), this.paused && this.sids.get(this.paused.info.sid) === d.script ? this.paused.info.line : 0);
  }

  async prepare() {
    const app = this.app;
    await app.lua.ensure();
    const lua = app.lua.host.lua;
    const compile = (src) => {
      lua.global.set('__ISRC', src);
      lua.doStringSync('local f, e = loadstring(__ISRC, "=x") __IERR = e or false __ISRC = nil');
      const e = lua.global.get('__IERR');
      lua.doStringSync('__IERR = nil');
      return e || null;
    };
    this.sids.clear();
    this.sidOf.clear();
    const swapped = [];
    let n = 0;
    for (const d of app.dm.root.descendants()) {
      if (!SCRIPT_CLASSES.has(d.ClassName)) continue;
      const src = String(d.props.get('Source') || '');
      if (!src.trim() || src.length > 400000) continue;
      const sid = 'd' + ++n;
      const out = instrumentChecked(src, sid, compile);
      if (!out) continue;
      this.sids.set(sid, d);
      this.sidOf.set(d, sid);
      swapped.push([d, src]);
      d.props.set('Source', out);
    }
    try {
      return writePlace(app.dm);
    } finally {
      for (const [d, src] of swapped) d.props.set('Source', src);
    }
  }

  payload() {
    const bps = {};
    for (const [script, lines] of this.bps) {
      const sid = this.sidOf.get(script);
      if (sid && lines.size) bps[sid] = [...lines];
    }
    return bps;
  }

  frameWindow() {
    const d = this.app.docs.get('play');
    return d && d.ed.frame ? d.ed.frame.contentWindow : null;
  }

  toServer(msg) {
    this.app.sendDebug({ t: 'dbg', ...msg });
  }

  toClient(msg) {
    const w = this.frameWindow();
    if (w) w.postMessage({ chocolateDbgCmd: msg }, location.origin);
  }

  sendBreakpoints() {
    if (!this.app.playing) return;
    const bps = this.payload();
    this.toServer({ cmd: 'bps', bps });
    this.toClient({ cmd: 'bps', bps });
    this.sendWatches();
  }

  sendWatches() {
    this.toServer({ cmd: 'watches', watches: this.watches });
    this.toClient({ cmd: 'watches', watches: this.watches });
  }

  onServer(m) {
    if (m.out) this.output(m.out, 'server');
    if (m.pause) this.pause('server', m.pause);
  }

  onFrame(e) {
    if (e.origin !== location.origin || !e.data || !e.data.chocolateDbg) return;
    const w = this.frameWindow();
    if (!w || e.source !== w) return;
    const m = e.data.chocolateDbg;
    if (m.ready) {
      const bps = this.payload();
      this.toClient({ cmd: 'bps', bps });
      this.toClient({ cmd: 'watches', watches: this.watches });
    }
    if (m.out) this.output(m.out, 'client');
    if (m.pause) this.pause('client', m.pause);
  }

  resolve(path) {
    const parts = String(path).split('.');
    let at = this.app.dm.root;
    for (const p of parts) {
      const next = at.children.find((c) => c.props.get('Name') === p) || (at === this.app.dm.root ? this.app.dm.services.get(p) : null);
      if (!next) return null;
      at = next;
    }
    return at;
  }

  output(line, side) {
    const err = /^\[error\]/.test(line);
    const warn = /^\[warn\]/.test(line);
    const text = line.replace(/^\[(error|warn|print|info)\]\s*/, '');
    this.app.print(`${side === 'server' ? 'Server' : 'Client'}: ${text}`, err ? 'err' : warn ? 'warn' : '');
    if (!err) return;
    const m = /([A-Za-z_][\w.]*):(\d+):/.exec(text);
    const script = m ? this.resolve(m[1]) : null;
    if (script && SCRIPT_CLASSES.has(script.ClassName)) {
      this.lastError = { script, line: +m[2], msg: text };
      if (this.mode !== 'never') this.gotoError();
    }
  }

  noteError(text) {
    const m = /([A-Za-z_][\w.]*):(\d+):/.exec(String(text));
    const script = m ? this.resolve(m[1]) : null;
    if (script && SCRIPT_CLASSES.has(script.ClassName)) this.lastError = { script, line: +m[2], msg: String(text) };
  }

  gotoError() {
    const e = this.lastError;
    if (!e || !e.script.parent) return this.app.ui.status('There is no script error to go to');
    this.app.openScript(e.script);
    this.app.extras.gotoLineNumber(e.line);
    this.app.ui.status(e.msg.slice(0, 200));
  }

  pause(side, info) {
    const script = this.sids.get(info.sid);
    this.paused = { side, info, script };
    if (script) {
      this.app.openScript(script);
      this.app.extras.gotoLineNumber(info.line);
    }
    this.refreshEditors();
    this.renderStack();
    this.renderWatch();
    this.app.ui.togglePane('callstack', true);
    this.app.ui.togglePane('watch', true);
    this.app.ui.status(`Paused at ${script ? script.props.get('Name') : info.sid}:${info.line} (${side})`);
    this.app.refreshUI();
  }

  command(cmd) {
    if (cmd === 'pause') {
      if (!this.app.playing) return;
      this.toServer({ cmd: 'pause' });
      this.toClient({ cmd: 'pause' });
      this.app.ui.status('Pausing at the next line that runs');
      return;
    }
    const p = this.paused;
    if (!p) return;
    this.paused = null;
    if (p.side === 'server') this.toServer({ cmd });
    else this.toClient({ cmd });
    this.refreshEditors();
    this.renderStack();
    this.app.ui.status(cmd === 'continue' ? 'Running' : 'Stepping');
    this.app.refreshUI();
  }

  stopped() {
    this.paused = null;
    this.refreshEditors();
    this.renderStack();
  }

  pane(id, title) {
    if (!this.panes[id]) {
      const body = this.app.ui.addPane(id, title, 'bottom');
      this.panes[id] = el('div', 'st-findresults st-debugpane', body);
      this.app.ui.togglePane(id, false);
    }
    return this.panes[id];
  }

  renderBreakpoints() {
    const box = this.pane('breakpoints', 'Breakpoints');
    box.replaceChildren();
    if (!this.bps.size) el('div', 'info', box, 'No breakpoints. Click a line number in a script to add one.');
    for (const [script, lines] of this.bps) {
      for (const line of [...lines].sort((a, b) => a - b)) {
        const r = el('div', 'st-findhit', box, `${script.fullName ? script.fullName() : script.props.get('Name')}:${line}`);
        r.addEventListener('click', () => {
          this.app.openScript(script);
          this.app.extras.gotoLineNumber(line);
        });
        const x = el('span', 'st-dbg-x', r, ' ×');
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggle(script, line);
        });
      }
    }
  }

  renderStack() {
    const box = this.pane('callstack', 'Call Stack');
    box.replaceChildren();
    const p = this.paused;
    if (!p) {
      el('div', 'info', box, this.app.playing ? 'Running' : 'Not debugging');
      return;
    }
    for (const [src, line, name] of p.info.stack || []) {
      const sid = /^__dbg|^\[string/.test(src) ? null : src;
      el('div', 'st-findhit', box, `${name || '(main)'}  ${sid || src}:${line}`);
    }
  }

  renderWatch() {
    const box = this.pane('watch', 'Watch');
    box.replaceChildren();
    const p = this.paused;
    const bar = el('div', 'st-watch-bar', box);
    const add = el('button', null, bar, 'Add Watch...');
    add.addEventListener('click', () => this.addWatch());
    if (p) {
      for (const [k, v, t] of p.info.locals || []) el('div', 'st-watch-row', box, `${k} = ${v}   (${t})`);
    }
    for (const [i, w] of this.watches.entries()) {
      const val = p && p.info.watches ? (p.info.watches.find((x) => x[0] === w) || [])[1] : '';
      const r = el('div', 'st-watch-row st-watch-expr', box, `${w} = ${val ?? ''}`);
      const x = el('span', 'st-dbg-x', r, ' ×');
      x.addEventListener('click', () => {
        this.watches.splice(i, 1);
        this.sendWatches();
        this.renderWatch();
      });
    }
  }

  async addWatch() {
    const ed = this.app.extras.editor();
    const sel = ed ? ed.ta.value.slice(ed.ta.selectionStart, ed.ta.selectionEnd).trim() : '';
    const expr = await this.app.ui.prompt('Add Watch', 'Expression to watch', sel && !sel.includes('\n') ? sel : '');
    if (!expr || !expr.trim()) return;
    this.watches.push(expr.trim().slice(0, 200));
    this.sendWatches();
    this.app.ui.togglePane('watch', true);
    this.renderWatch();
  }
}
