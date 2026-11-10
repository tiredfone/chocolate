import { publicPath } from '../client/assets.js';

const S = (strip, i, w = 16) => ({ strip, i, w });
const P = (name) => ({ png: name });

export const ICONS = {
  new: S('toolbar-standard', 0, 15), open: S('toolbar-standard', 1, 15), save: S('toolbar-standard', 2, 15),
  cut: S('toolbar-standard', 3, 15), copy: S('toolbar-standard', 4, 15), paste: S('toolbar-standard', 5, 15),
  undo: S('toolbar-standard', 6, 15), redo: S('toolbar-standard', 7, 15), group: S('toolbar-standard', 8, 15), ungroup: S('toolbar-standard', 9, 15),
  rotate: S('toolbar-standard', 10, 15), tilt: S('toolbar-standard', 11, 15), up: S('toolbar-standard', 12, 15), down: S('toolbar-standard', 13, 15),
  'tool:drag': S('toolbar-edit', 0), 'tool:axis': S('toolbar-edit', 1), 'tool:resize': S('toolbar-edit', 2), 'tool:lock': S('toolbar-edit', 3), 'tool:anchor': S('toolbar-edit', 4),
  'tool:paint': S('toolbar-edit', 5), 'tool:dropper': S('toolbar-edit', 6), 'tool:material': S('toolbar-edit', 7),
  'tool:surface0': S('toolbar-edit', 8), 'tool:surface1': S('toolbar-edit', 9), 'tool:surface2': S('toolbar-edit', 10), 'tool:surface3': S('toolbar-edit', 11),
  'tool:surface4': S('toolbar-edit', 12), 'tool:surface5': S('toolbar-edit', 13), 'tool:surface6': S('toolbar-edit', 14), 'tool:surface7': S('toolbar-edit', 15),
  run: S('toolbar-run', 0), pause: S('toolbar-run', 1), reset: S('toolbar-run', 2),
  'cam:panleft': S('toolbar-camera', 0), 'cam:panright': S('toolbar-camera', 1), 'cam:tiltup': S('toolbar-camera', 2), 'cam:tiltdown': S('toolbar-camera', 3),
  'cam:zoomin': S('toolbar-camera', 4), 'cam:zoomout': S('toolbar-camera', 5), 'cam:lookat': S('toolbar-camera', 6), 'cam:extents': S('toolbar-camera', 7),
  'tool:move': S('toolbar-advanced', 0), 'tool:rotate': S('toolbar-advanced', 1), 'tool:size': S('toolbar-advanced', 2),
  'grid:1': S('toolbar-advanced', 3), 'grid:0.2': S('toolbar-advanced', 4), 'grid:0': S('toolbar-advanced', 5), joints: S('toolbar-advanced', 6), 'view:objects': S('toolbar-advanced', 7),
  delete: P('delete_x_16'), publish: S('toolbar-standard', 2, 15), publish2: P('world_16'), saveas: P('save_16'), 'view:explorer': P('explorer_16'), 'view:output': P('output_16'), 'view:properties': P('table_16'),
  lockall: P('lock_open_16'), lock: P('lock_16'), 'insert:object': P('toolbox_16'), playsolo: P('script_go_16'),
};

export const MENUS = [
  ['File', [
    ['publish', 'Save\tCtrl+S'], ['saveas', 'Save As...'], ['open', 'Open...'], null,
    ['publish2', 'Publish to ROBLOX...'], null,
    ['savemodel', 'Save Selection as Model...'], null,
    ['exit', 'Exit'],
  ]],
  ['Edit', [
    ['undo', 'Undo\tCtrl+Z'], ['redo', 'Redo\tCtrl+Y'], null,
    ['cut', 'Cut\tCtrl+X'], ['copy', 'Copy\tCtrl+C'], ['paste', 'Paste\tCtrl+V'], null,
    ['delete', 'Clear\tDel'], ['selectall', 'Select All\tCtrl+A'], ['duplicate', 'Duplicate\tCtrl+D'], null,
    ['lock', 'Lock'], ['lockall', 'Unlock All'],
  ]],
  ['View', [
    ['view:objects', 'Toolbox'], ['view:explorer', 'Explorer'], ['view:properties', 'Properties'], ['view:output', 'Output'], ['objectbrowser', 'Object Browser'], null,
    ['fullscreen', 'Full Screen'],
  ]],
  ['Insert', [
    ['insert:model', 'Model...'], null,
    ['insert:object', 'Object...'], ['insert:service', 'Service...'], null,
    ['clearstarterpack', 'Clear Tools in Starterpack'],
  ]],
  ['Format', [
    ['rotate', 'Rotate\tCtrl+R'], ['tilt', 'Tilt\tCtrl+T'], null,
    ['group', 'Group\tCtrl+G'], ['ungroup', 'Ungroup\tCtrl+U'], ['selectchildren', 'Select Children'], null,
    ['up', 'Move Up'], ['down', 'Move Down'],
  ]],
  ['Tools', [
    ['joints', 'Manual Joints'], null,
    ['objectbrowser', 'Object Browser'],
  ]],
  ['Test', [
    ['playsolo', 'Play Solo'],
  ]],
  ['Help', [
    ['objectbrowser', 'Object Reference'], null,
    ['about', 'About Studio...'],
  ]],
];

export const SELECTION_MENU = [
  ['cut', 'Cut\tCtrl+X'], ['copy', 'Copy\tCtrl+C'], ['pasteinto', 'Paste Into\tCtrl+Shift+V'], null,
  ['group', 'Group'], ['ungroup', 'Ungroup'], ['selectchildren', 'Select Children'], null,
  ['delete', 'Delete\tDel'], ['rename', 'Rename'], null,
  ['savemodel', 'Save to File...'],
];

export const TOOLBARS = [
  ['publish', 'open', null, 'cut', 'copy', 'paste', null, 'undo', 'redo', null, 'group', 'ungroup', null, 'rotate', 'tilt', null, 'up', 'down'],
  ['tool:drag', 'tool:axis', 'tool:resize', null, 'tool:lock', 'tool:anchor', null, 'tool:paint', 'tool:dropper', null, 'tool:material', null,
    'tool:surface0', 'tool:surface1', 'tool:surface2', 'tool:surface3', 'tool:surface4', 'tool:surface5', 'tool:surface6', 'tool:surface7'],
  ['run', 'pause', 'reset'],
  ['cam:panleft', 'cam:panright', 'cam:tiltup', 'cam:tiltdown', 'cam:zoomin', 'cam:zoomout', 'cam:lookat', 'cam:extents'],
  ['tool:move', 'tool:rotate', 'tool:size', null, 'grid:1', 'grid:0.2', 'grid:0', null, 'joints', null, 'view:objects'],
];

export const TIPS = {
  publish: 'Save the place', open: 'Open a place file from your device', cut: 'Cut the selection and put it on the Clipboard', copy: 'Copy the selection and put it on the Clipboard',
  paste: 'Insert Clipboard contents', undo: 'Undo the last action', redo: 'Redo the previously undone action', group: 'Group parts or models', ungroup: 'Ungroup models or parts',
  rotate: 'Rotate objects', tilt: 'Tilt objects', up: 'Move objects up', down: 'Move objects down',
  'tool:drag': 'Drag', 'tool:axis': 'Move on axis', 'tool:resize': 'Resize', 'tool:lock': 'Lock - prevent selection', 'tool:anchor': 'Anchor - prevent moving',
  'tool:paint': 'Fill With Color', 'tool:dropper': 'Pick Color', 'tool:material': 'Change Material',
  'tool:surface0': 'Smooth Surface', 'tool:surface1': 'Glue Surface', 'tool:surface2': 'Weld Surface', 'tool:surface3': 'Connectors on Surface',
  'tool:surface4': 'Indents on Surface', 'tool:surface5': 'Universals for Surface', 'tool:surface6': 'Hinge on Surface', 'tool:surface7': 'Motor on Surface',
  run: 'Test-run (opens the game)', pause: 'Pauses the run', reset: 'Stops and reloads the document',
  'cam:panleft': 'Pan Left', 'cam:panright': 'Pan Right', 'cam:tiltup': 'Tilt Up', 'cam:tiltdown': 'Tilt Down', 'cam:zoomin': 'Zoom In', 'cam:zoomout': 'Zoom Out',
  'cam:lookat': 'Look At Object', 'cam:extents': 'Zoom Extents', 'tool:move': 'Move Parts', 'tool:rotate': 'Rotate Parts', 'tool:size': 'Resize Parts',
  'grid:1': 'One Stud Grid', 'grid:0.2': '1/5 Stud Grid', 'grid:0': 'Grid Off', joints: 'Manual Joints', 'view:objects': 'Toolbox',
};

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function iconStyle(id) {
  const ic = ICONS[id];
  if (!ic) return '';
  if (ic.png) return `background-image:url("${publicPath('/studio/ui/' + ic.png + '.png')}")`;
  return `background-image:url("${publicPath('/studio/ui/' + ic.strip + '.png')}");background-position:${-ic.i * ic.w}px 0`;
}

export function classIconStyle(index) {
  return `background-image:url("${publicPath('/studio/ui/class-images.png')}");background-position:${-index * 16}px 0`;
}

export class UI {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.popups = [];
    this.buttons = new Map();
    this.panes = new Map();
    this.build();
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.st-popup') && !e.target.closest('.st-menu-title') && !e.target.closest('.st-hamburger')) this.closePopups();
    });
    window.addEventListener('blur', () => this.closePopups());
  }

  build() {
    const r = this.root;
    const bar = el('div', 'st-menubar', r);
    const ham = el('div', 'st-menu-title st-hamburger', bar, '☰');
    ham.addEventListener('click', (e) => this.openPopup(MENUS.map(([t, items]) => [t, items]), ham.getBoundingClientRect(), 0));
    for (const [title, items] of MENUS) {
      const t = el('div', 'st-menu-title', bar, title);
      t.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (t.classList.contains('open')) return this.closePopups();
        this.closePopups();
        t.classList.add('open');
        this.openPopup(items, t.getBoundingClientRect(), 0, () => t.classList.remove('open'));
      });
      t.addEventListener('pointerenter', () => {
        const open = bar.querySelector('.st-menu-title.open');
        if (open && open !== t) {
          this.closePopups();
          t.classList.add('open');
          this.openPopup(items, t.getBoundingClientRect(), 0, () => t.classList.remove('open'));
        }
      });
    }
    this.titleEl = el('div', 'st-title', bar);
    const tbs = el('div', 'st-toolbars', r);
    for (const tb of TOOLBARS) {
      const t = el('div', 'st-toolbar', tbs);
      for (const id of tb) {
        if (!id) {
          el('div', 'st-tb-sep', t);
          continue;
        }
        const b = el('div', 'st-btn', t);
        b.title = TIPS[id] || id;
        const i = el('i', null, b);
        i.style.cssText = iconStyle(id);
        b.addEventListener('click', () => {
          if (!b.classList.contains('disabled')) this.app.exec(id);
        });
        this.buttons.set(id, b);
      }
    }
    const body = el('div', 'st-body', r);
    this.left = el('div', 'st-dock st-dock-left', body);
    this.splitLeft = el('div', 'st-splitter-v', body);
    const center = el('div', 'st-center', body);
    this.tabs = el('div', 'st-tabs', center);
    this.docs = el('div', 'st-docs', center);
    this.splitBottom = el('div', 'st-splitter-h', center);
    this.bottom = el('div', 'st-dock st-dock-bottom', center);
    this.splitRight = el('div', 'st-splitter-v', body);
    this.right = el('div', 'st-dock st-dock-right', body);
    this.splitRightInner = null;
    this.sheet = el('div', 'st-sheet collapsed', r);
    this.sheetTabs = el('div', 'st-sheet-tabs', this.sheet);
    this.sheetBody = el('div', 'st-sheet-body', this.sheet);
    const status = el('div', 'st-statusbar', r);
    this.statusLeft = el('span', null, status, 'Ready');
    this.statusRight = el('span', null, status, '');
    this.splitter(this.splitLeft, this.left, 'x', 1);
    this.splitter(this.splitRight, this.right, 'x', -1);
    this.splitter(this.splitBottom, this.bottom, 'y', -1);
  }

  splitter(handle, target, axis, sign) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const start = axis === 'x' ? e.clientX : e.clientY;
      const size = axis === 'x' ? target.offsetWidth : target.offsetHeight;
      const move = (ev) => {
        const d = ((axis === 'x' ? ev.clientX : ev.clientY) - start) * sign;
        const v = Math.max(80, Math.min(900, size + d));
        target.style[axis === 'x' ? 'width' : 'height'] = v + 'px';
        this.app.resized();
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  addPane(id, title, dock, iconId) {
    const p = el('div', 'st-pane');
    const cap = el('div', 'st-pane-caption', p, title);
    const close = el('div', 'st-close', cap, '×');
    close.addEventListener('click', () => this.togglePane(id, false));
    const body = el('div', 'st-pane-body', p);
    const tab = el('div', null, this.sheetTabs, title);
    tab.addEventListener('click', () => this.showSheet(id));
    const pane = { id, el: p, body, dock, tab, title };
    this.panes.set(id, pane);
    this.place(pane);
    return body;
  }

  place(pane) {
    const target = pane.dock === 'left' ? this.left : pane.dock === 'bottom' ? this.bottom : this.right;
    if (pane.el.parentNode !== target) target.appendChild(pane.el);
  }

  mobile() {
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  }

  layout() {
    const m = this.mobile();
    for (const pane of this.panes.values()) {
      if (m) {
        if (pane.el.parentNode !== this.sheetBody) this.sheetBody.appendChild(pane.el);
        pane.el.hidden = this.sheetActive !== pane.id;
      } else {
        this.place(pane);
        pane.el.hidden = !!pane.closed;
      }
    }
    for (const d of [this.left, this.right, this.bottom]) d.style.display = [...d.children].some((c) => !c.hidden) ? '' : 'none';
    this.splitLeft.style.display = this.left.style.display;
    this.splitRight.style.display = this.right.style.display;
    this.splitBottom.style.display = this.bottom.style.display;
    this.app.resized();
  }

  showSheet(id) {
    if (this.sheetActive === id && !this.sheet.classList.contains('collapsed')) {
      this.sheet.classList.add('collapsed');
      this.sheetActive = null;
    } else {
      this.sheet.classList.remove('collapsed');
      this.sheetActive = id;
    }
    for (const p of this.panes.values()) p.tab.classList.toggle('active', p.id === this.sheetActive);
    this.layout();
  }

  togglePane(id, on) {
    const p = this.panes.get(id);
    if (!p) return;
    if (this.mobile()) {
      this.showSheet(id);
      return;
    }
    p.closed = on === undefined ? !p.closed : !on;
    this.layout();
    this.app.refreshUI();
  }

  paneOpen(id) {
    const p = this.panes.get(id);
    return !!p && !p.closed;
  }

  setTitle(t) {
    this.titleEl.textContent = t;
    document.title = t;
  }

  status(left, right) {
    if (left != null) this.statusLeft.textContent = left;
    if (right != null) this.statusRight.textContent = right;
  }

  refresh() {
    for (const [id, b] of this.buttons) {
      b.classList.toggle('disabled', !this.app.enabled(id));
      b.classList.toggle('active', !!this.app.checked(id));
    }
  }

  closePopups() {
    for (const p of this.popups) {
      p.el.remove();
      if (p.onClose) p.onClose();
    }
    this.popups = [];
  }

  openPopup(items, rect, depth, onClose) {
    this.popups.splice(depth).forEach((p) => {
      p.el.remove();
      if (p.onClose) p.onClose();
    });
    const pop = el('div', 'st-popup', document.body);
    this.popups.push({ el: pop, onClose });
    for (const it of items) {
      if (!it) {
        el('div', 'st-sep', pop);
        continue;
      }
      const [id, label] = it;
      const sub = Array.isArray(label) ? label : null;
      const text = sub ? id : label;
      const [name, key] = String(text).split('\t');
      const row = el('div', 'st-item' + (sub ? ' sub' : ''), pop);
      const icon = el('div', 'st-icon', row);
      if (!sub) icon.style.cssText = iconStyle(id);
      el('span', null, row, name);
      if (key) el('span', 'st-key', row, key);
      if (!sub && !this.app.enabled(id)) row.classList.add('disabled');
      if (!sub && this.app.checked(id)) row.classList.add('checked');
      if (sub) {
        const open = () => this.openPopup(sub, row.getBoundingClientRect(), depth + 1);
        row.addEventListener('pointerenter', open);
        row.addEventListener('click', open);
      } else {
        row.addEventListener('pointerenter', () => this.popups.splice(depth + 1).forEach((p) => p.el.remove()));
        row.addEventListener('click', () => {
          if (row.classList.contains('disabled')) return;
          this.closePopups();
          this.app.exec(id);
        });
      }
    }
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = depth ? rect.right - 2 : rect.left, y = depth ? rect.top - 3 : rect.bottom;
    if (x + w > window.innerWidth) x = Math.max(0, depth ? rect.left - w + 2 : window.innerWidth - w);
    if (y + h > window.innerHeight) y = Math.max(0, window.innerHeight - h);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    return pop;
  }

  contextMenu(items, x, y) {
    this.closePopups();
    this.openPopup(items, { left: x, right: x, top: y, bottom: y }, 0);
  }

  dialog(title, build, buttons = [['OK', true]]) {
    return new Promise((resolve) => {
      const back = el('div', 'st-dialog-back', document.body);
      const d = el('div', 'st-dialog', back);
      el('div', 'st-dlg-title', d, title);
      const body = el('div', 'st-dlg-body', d);
      const get = build(body, (v) => finish(v)) || (() => true);
      const btns = el('div', 'st-dlg-buttons', d);
      const finish = (v) => {
        back.remove();
        resolve(v);
      };
      for (const [label, val] of buttons) {
        const b = el('button', null, btns, label);
        b.addEventListener('click', () => finish(val === true ? get() : val));
      }
      const first = body.querySelector('input');
      if (first) {
        first.focus();
        first.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(get());
          if (e.key === 'Escape') finish(null);
        });
      }
    });
  }

  prompt(title, label, value = '') {
    return this.dialog(title, (body) => {
      el('div', null, body, label).style.marginBottom = '6px';
      const i = el('input', null, body);
      i.type = 'text';
      i.value = value;
      return () => i.value;
    }, [['OK', true], ['Cancel', null]]);
  }

  alert(title, text) {
    return this.dialog(title, (body) => {
      el('div', null, body, text).style.whiteSpace = 'pre-wrap';
    });
  }

  confirm(title, text) {
    return this.dialog(title, (body) => {
      el('div', null, body, text).style.whiteSpace = 'pre-wrap';
    }, [['Yes', 'yes'], ['No', null]]);
  }

  tab(id, title, onSelect, onClose) {
    let t = this.tabs.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!t) {
      t = el('div', 'st-tab', this.tabs);
      t.dataset.id = id;
      el('span', null, t, title);
      t.addEventListener('click', (e) => {
        if (!e.target.classList.contains('st-close')) onSelect();
      });
      if (onClose) {
        const c = el('span', 'st-close', t, '×');
        c.addEventListener('click', () => onClose());
      }
    }
    for (const x of this.tabs.children) x.classList.toggle('active', x === t);
    return t;
  }

  removeTab(id) {
    const t = this.tabs.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (t) t.remove();
  }
}

export { el };
