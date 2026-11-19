import { endpointUrl } from './assets.js';

const MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function fmt(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

export class GameRecorder {
  constructor({ root, canvas, world, uploadUrl, csrf, title, onChange }) {
    this.root = root;
    this.canvas = canvas;
    this.world = world;
    this.uploadUrl = uploadUrl;
    this.csrf = csrf || '';
    this.title = title || 'Solar recording';
    this.onChange = onChange || (() => {});
    this.rec = null;
    this.stream = null;
    this.chunks = [];
    this.badge = null;
    this.timer = null;
  }

  get recording() {
    return !!(this.rec && this.rec.state === 'recording');
  }

  toggle() {
    if (this.recording) this.stop();
    else this.start();
  }

  async capture() {
    const md = navigator.mediaDevices;
    if (md && md.getDisplayMedia) {
      try {
        return await md.getDisplayMedia({
          video: { frameRate: 30, displaySurface: 'browser' },
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'exclude',
          systemAudio: 'include',
        });
      } catch (e) {
        if (e && e.name === 'NotAllowedError') return null;
      }
    }
    if (!this.canvas.captureStream) return null;
    const s = this.canvas.captureStream(30);
    const w = this.world;
    if (w && w.audio && w.master && w.audio.createMediaStreamDestination) {
      const dest = w.audio.createMediaStreamDestination();
      w.master.connect(dest);
      this.tap = dest;
      for (const t of dest.stream.getAudioTracks()) s.addTrack(t);
    }
    return s;
  }

  async start() {
    if (this.rec || this.starting) return;
    const mime = pickMime();
    if (mime === null) return this.notice('Recording is not supported in this browser.');
    this.starting = true;
    const stream = await this.capture();
    this.starting = false;
    if (!stream) return this.notice('Recording was cancelled.');
    this.stream = stream;
    this.chunks = [];
    const rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 2500000 }, mime ? { mimeType: mime } : {}));
    this.rec = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    rec.onstop = () => this.finish(rec.mimeType || mime || 'video/webm');
    for (const t of stream.getVideoTracks()) t.addEventListener('ended', () => this.stop());
    rec.start(1000);
    this.started = performance.now();
    this.showBadge();
    this.onChange(true);
  }

  stop() {
    if (!this.rec) return;
    if (this.rec.state !== 'inactive') this.rec.stop();
    for (const t of this.stream ? this.stream.getTracks() : []) t.stop();
    if (this.tap && this.world && this.world.master) {
      try { this.world.master.disconnect(this.tap); } catch {}
    }
    this.tap = null;
    this.hideBadge();
    this.onChange(false);
  }

  finish(type) {
    const blob = new Blob(this.chunks, { type: type.split(';')[0] });
    this.rec = null;
    this.stream = null;
    this.chunks = [];
    if (blob.size) this.showResult(blob);
  }

  showBadge() {
    const b = document.createElement('div');
    b.className = 'ch-rec-badge';
    b.textContent = '● REC 0:00';
    this.root.appendChild(b);
    this.badge = b;
    this.timer = setInterval(() => {
      if (this.badge) this.badge.textContent = '● REC ' + fmt((performance.now() - this.started) / 1000);
    }, 500);
  }

  hideBadge() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.badge) this.badge.remove();
    this.badge = null;
  }

  async refreshCsrf() {
    const url = endpointUrl('csrf');
    if (!url) return false;
    try {
      const j = await (await fetch(url, { credentials: 'same-origin', cache: 'no-store' })).json();
      if (!j || !j.token) return false;
      this.csrf = j.token;
      return true;
    } catch {
      return false;
    }
  }

  notice(text) {
    const n = document.createElement('div');
    n.className = 'ch-rec-notice';
    n.textContent = text;
    this.root.appendChild(n);
    setTimeout(() => n.remove(), 3500);
  }

  showResult(blob) {
    const url = URL.createObjectURL(blob);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const wrap = document.createElement('div');
    wrap.className = 'ch-rec-dialog';
    const box = document.createElement('div');
    box.className = 'ch-rec-box';
    const h = document.createElement('div');
    h.className = 'ch-rec-title';
    h.textContent = 'Recording finished (' + (blob.size / 1048576).toFixed(1) + ' MB)';
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.className = 'ch-rec-video';
    const status = document.createElement('div');
    status.className = 'ch-rec-status';
    const row = document.createElement('div');
    row.className = 'ch-rec-row';
    const button = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-rec-btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    };
    const close = () => {
      wrap.remove();
      URL.revokeObjectURL(url);
    };
    button('Download', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = (this.title || 'Recording').replace(/[\\/:*?"<>|]/g, '_') + '.' + ext;
      a.click();
    });
    if (this.uploadUrl) {
      const up = button('Upload to Streamable', async () => {
        up.disabled = true;
        status.textContent = 'Uploading...';
        try {
          const fd = new FormData();
          fd.append('video', blob, 'recording.' + ext);
          fd.append('title', this.title);
          fd.append('_csrf', this.csrf);
          const post = () => fetch(this.uploadUrl, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': this.csrf } });
          let r = await post();
          if (r.status === 403 && (await this.refreshCsrf())) {
            fd.set('_csrf', this.csrf);
            r = await post();
          }
          const j = await r.json().catch(() => null);
          if (!j || !j.success) throw new Error((j && j.error) || 'Upload failed (HTTP ' + r.status + ')');
          status.textContent = '';
          const link = document.createElement('a');
          link.href = j.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = j.url;
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'ch-rec-btn';
          copy.textContent = 'Copy link';
          copy.addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(j.url));
          status.append('Uploaded: ', link, ' ', copy);
        } catch (e) {
          status.textContent = e.message;
          up.disabled = false;
        }
      });
    }
    button('Close', close);
    box.append(h, video, row, status);
    wrap.appendChild(box);
    wrap.addEventListener('keydown', (e) => e.stopPropagation());
    this.root.appendChild(wrap);
  }
}
