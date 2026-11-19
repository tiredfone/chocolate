import { endpointUrl } from '../client/assets.js';
import { createMcp } from './mcp.js';
import { el } from './ui.js';

const STORE = 'chocolate-studio-mcp-tab';

function tabId() {
  let id = '';
  try {
    id = sessionStorage.getItem(STORE + '-id') || '';
  } catch {
    id = '';
  }
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    id = [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
    try {
      sessionStorage.setItem(STORE + '-id', id);
    } catch {
      id = id || 'tab' + Date.now();
    }
  }
  return id;
}

export class McpBridge {
  constructor(app) {
    this.app = app;
    this.mcp = createMcp(app);
    this.tab = tabId();
    this.enabled = false;
    this.running = false;
    this.served = 0;
    this.lastError = null;
    this.lastPoll = 0;
    let saved = null;
    try {
      saved = sessionStorage.getItem(STORE);
    } catch {
      saved = null;
    }
    if (saved === '1') setTimeout(() => this.set(true), 0);
  }

  get available() {
    return !!(endpointUrl('studioMcpPoll', 0) && endpointUrl('studioMcpToken', 0));
  }

  url() {
    const p = endpointUrl('studioMcp', 0);
    return p ? new URL(p, location.origin).href : '';
  }

  set(on) {
    on = !!on && this.available;
    if (on === this.enabled) return;
    this.enabled = on;
    try {
      sessionStorage.setItem(STORE, on ? '1' : '0');
    } catch {}
    if (on) {
      this.app.print('MCP is on for this tab: external MCP clients can edit this place.', 'info');
      this.loop();
    } else {
      this.post('studioMcpPoll', { tab: this.tab, place: this.app.cfg.placeId, enabled: false }).catch(() => {});
      this.app.print('MCP is off for this tab.', 'info');
    }
    this.app.refreshUI();
  }

  async post(endpoint, body) {
    const url = endpointUrl(endpoint, this.app.cfg.placeId);
    if (!url) throw new Error('MCP is not configured on this host');
    const send = () => fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.app.cfg.csrf || '' },
      body: JSON.stringify(body),
    });
    let r = await send();
    if (r.status === 403 && (await this.app.refreshCsrf())) r = await send();
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.success === false) throw new Error((j && j.error) || `Request failed (${r.status})`);
    return j;
  }

  async loop() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.enabled) {
        try {
          const j = await this.post('studioMcpPoll', { tab: this.tab, place: this.app.cfg.placeId, enabled: true, active: document.hasFocus(), wait: 8 });
          this.lastPoll = Date.now();
          this.lastError = null;
          for (const c of j.calls || []) this.handle(c);
        } catch (e) {
          this.lastError = e.message;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } finally {
      this.running = false;
    }
  }

  async handle(c) {
    const out = await this.mcp.call(c.tool, c.args);
    this.served++;
    this.app.print(`MCP ${c.tool}${out.ok ? '' : ': ' + out.error}`, out.ok ? 'info' : 'warn');
    const body = out.ok ? { id: c.id, tab: this.tab, ok: true, result: out.result } : { id: c.id, tab: this.tab, ok: false, error: out.error };
    await this.post('studioMcpResult', body).catch((e) => this.app.print('MCP result was not delivered: ' + e.message, 'err'));
  }

  async tokenCall(action) {
    const url = endpointUrl('studioMcpToken', 0);
    const send = () => fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.app.cfg.csrf || '' },
      body: JSON.stringify({ action }),
    });
    let r = await send();
    if (r.status === 403 && (await this.app.refreshCsrf())) r = await send();
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.success) throw new Error((j && j.error) || `Request failed (${r.status})`);
    return j;
  }

  async showPanel() {
    const app = this.app;
    const url = this.url();
    await app.ui.dialog('MCP', (body) => {
      body.style.minWidth = 'min(86vw, 460px)';
      const note = (t, cls) => el('div', cls || null, body, t);
      note('Let Claude Desktop, Claude Code or any MCP client edit this place through this open Studio tab. Calls run as you, on the place you have open, and every change can be undone here.').style.marginBottom = '8px';
      const row = el('label', null, body);
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px';
      const on = el('input', null, row);
      on.type = 'checkbox';
      on.checked = this.enabled;
      el('span', null, row, 'Accept MCP calls in this tab');
      const state = el('div', null, body);
      state.style.cssText = 'margin-bottom:8px;opacity:.8';
      const draw = () => {
        state.textContent = !this.available ? 'MCP is not available on this host.' : this.enabled ? (this.lastError ? 'Waiting: ' + this.lastError : `On. ${this.served} call${this.served === 1 ? '' : 's'} served in this tab.`) : 'Off.';
      };
      draw();
      on.addEventListener('change', () => {
        this.set(on.checked);
        on.checked = this.enabled;
        draw();
      });
      note('Endpoint').style.fontWeight = 'bold';
      const u = el('input', null, body);
      u.type = 'text';
      u.readOnly = true;
      u.value = url;
      u.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:8px';
      u.addEventListener('focus', () => u.select());
      note('Token').style.fontWeight = 'bold';
      const tokenInfo = el('div', null, body);
      tokenInfo.style.marginBottom = '4px';
      const tokenBox = el('input', null, body);
      tokenBox.type = 'text';
      tokenBox.readOnly = true;
      tokenBox.hidden = true;
      tokenBox.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:4px';
      tokenBox.addEventListener('focus', () => tokenBox.select());
      const btns = el('div', null, body);
      btns.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
      const create = el('button', null, btns, 'Create token');
      const revoke = el('button', null, btns, 'Revoke token');
      const pre = el('pre', null, body);
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;user-select:text;margin:0;padding:6px;background:rgba(0,0,0,.06);max-height:190px;overflow:auto;font-size:11px';
      let token = '<your token>';
      const snippets = () => {
        const t = token;
        pre.textContent = `Claude Code:\nclaude mcp add --transport http solar-studio ${url} --header "Authorization: Bearer ${t}"\n\nClaude Desktop (claude_desktop_config.json):\n` + JSON.stringify({ mcpServers: { 'solar-studio': { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:Bearer ' + t] } } }, null, 2) + '\n\nKeep this Studio tab open with the switch above on. Any client that sends the token as "Authorization: Bearer ..." works.';
      };
      const apply = (s) => {
        tokenInfo.textContent = s.hasToken ? `A token exists (created ${s.created}${s.lastUsed ? ', last used ' + s.lastUsed : ', never used'}). It is shown only when created.` : 'No token yet.';
        create.textContent = s.hasToken ? 'Replace token' : 'Create token';
        revoke.disabled = !s.hasToken;
        if (!s.hasToken) {
          token = '<your token>';
          tokenBox.hidden = true;
        }
        snippets();
      };
      const fail = (e) => {
        tokenInfo.textContent = 'Error: ' + e.message;
      };
      this.tokenCall('status').then(apply, fail);
      create.addEventListener('click', () => {
        this.tokenCall('create').then((s) => {
          token = s.token;
          tokenBox.value = s.token;
          tokenBox.hidden = false;
          apply(s);
          tokenInfo.textContent += ' Copy it now.';
        }, fail);
      });
      revoke.addEventListener('click', async () => {
        if (await app.ui.confirm('Revoke token', 'Clients using the current token will stop working.')) this.tokenCall('revoke').then(apply, fail);
      });
      snippets();
      const timer = setInterval(() => {
        if (!body.isConnected) clearInterval(timer);
        else draw();
      }, 1500);
    }, [['Close', null]]);
  }
}
