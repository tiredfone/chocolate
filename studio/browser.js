import { el, classIconStyle } from './ui.js';
import { classIcon } from './panes.js';
import { classMembers, classTree } from './reference.js';
import { CLASSES, ENUMS } from '../shared/classes.js';

function fmtDefault(p) {
  const v = p.def;
  if (v == null || p.type === 'computed') return '';
  if (Array.isArray(v)) return v.length > 4 ? '' : `(${v.map((n) => +(+n).toFixed(3)).join(', ')})`;
  if (p.type.startsWith('Enum.')) {
    const e = ENUMS[p.type.slice(5)];
    const name = e && Object.keys(e).find((k) => e[k] === v);
    return name ? `${p.type}.${name}` : String(v);
  }
  if (typeof v === 'string') return v ? JSON.stringify(v) : '';
  return String(v);
}

const TYPE_NAMES = { bool: 'bool', number: 'double', int: 'int', string: 'string', Content: 'Content', V3: 'Vector3', V2: 'Vector2', CF: 'CoordinateFrame', C3: 'Color3', BC: 'BrickColor', UD2: 'UDim2', UD: 'UDim', Ref: 'Object', computed: 'Vector3', any: 'Variant' };

export class ObjectBrowser {
  constructor(parent, app) {
    this.app = app;
    this.el = el('div', 'st-browser', parent);
    const left = el('div', 'st-br-left', this.el);
    this.search = el('input', null, left);
    this.search.type = 'text';
    this.search.placeholder = 'Search classes';
    this.search.addEventListener('keydown', (e) => e.stopPropagation());
    this.search.addEventListener('input', () => this.drawClasses());
    this.classList = el('div', 'st-br-list', left);
    const right = el('div', 'st-br-right', this.el);
    const head = el('div', 'st-br-head', right);
    this.title = el('div', 'st-br-title', head);
    const lab = el('label', 'st-br-inh', head);
    this.inherited = el('input', null, lab);
    this.inherited.type = 'checkbox';
    this.inherited.checked = true;
    lab.append(' Show inherited members');
    this.inherited.addEventListener('change', () => this.drawMembers());
    this.members = el('div', 'st-br-members', right);
    this.detail = el('div', 'st-br-detail', right);
    this.cls = 'Part';
    this.drawClasses();
    this.select('Part');
  }

  drawClasses() {
    const q = this.search.value.trim().toLowerCase();
    const list = this.classList;
    list.replaceChildren();
    const tree = classTree();
    const row = (name, depth) => {
      const info = CLASSES.get(name);
      const r = el('div', 'st-br-class' + (name === this.cls ? ' sel' : '') + (info.abstract ? ' abstract' : ''), list);
      r.style.paddingLeft = 4 + depth * 12 + 'px';
      const ic = el('div', 'st-cicon', r);
      ic.style.cssText = classIconStyle(classIcon(name)) + ';width:16px;height:16px';
      el('span', null, r, name);
      r.addEventListener('click', () => this.select(name));
      r.dataset.cls = name;
    };
    if (q) {
      for (const name of [...CLASSES.keys()].filter((n) => n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b))) row(name, 0);
      return;
    }
    const walk = (name, depth) => {
      row(name, depth);
      for (const k of tree.get(name) || []) walk(k, depth + 1);
    };
    for (const root of tree.get('') || []) walk(root, 0);
  }

  select(name) {
    if (!CLASSES.has(name)) return;
    this.cls = name;
    for (const r of this.classList.children) r.classList.toggle('sel', r.dataset.cls === name);
    this.drawMembers();
    this.describeClass();
  }

  describeClass() {
    const m = classMembers(this.cls);
    const flags = [m.creatable ? 'Creatable with Instance.new' : m.service ? 'Service (use game:GetService)' : 'Not creatable', m.abstract ? 'abstract' : ''].filter(Boolean).join(', ');
    this.detail.replaceChildren();
    el('div', 'st-br-sig', this.detail, `Class ${this.cls}${m.chain[1] ? ' : ' + m.chain[1] : ''}`);
    el('div', null, this.detail, `Inherits from ${m.chain.slice(1).join(' > ') || 'nothing'}. ${flags}. ${m.props.length} properties, ${m.methods.length} functions, ${m.events.length} events.`);
  }

  drawMembers() {
    const m = classMembers(this.cls);
    const all = this.inherited.checked;
    const own = (x) => all || x.from === this.cls;
    this.title.textContent = this.cls;
    const box = this.members;
    box.replaceChildren();
    const group = (title, items, kind, render) => {
      const shown = items.filter(own);
      if (!shown.length) return;
      el('div', 'st-br-group', box, `${title} (${shown.length})`);
      for (const it of shown) {
        const r = el('div', 'st-br-member', box);
        el('span', 'st-ac-kind k-' + kind, r, kind[0].toUpperCase());
        el('span', null, r, it.name);
        if (it.from !== this.cls) el('span', 'st-br-from', r, it.from);
        r.addEventListener('click', () => {
          for (const x of box.querySelectorAll('.st-br-member.sel')) x.classList.remove('sel');
          r.classList.add('sel');
          this.detail.replaceChildren();
          el('div', 'st-br-sig', this.detail, render(it));
          el('div', null, this.detail, `Member of ${it.from}.`);
        });
      }
    };
    group('Properties', m.props, 'property', (p) => `Property ${TYPE_NAMES[p.type] || p.type} ${this.cls}.${p.name}${fmtDefault(p) ? ' = ' + fmtDefault(p) : ''}`);
    group('Functions', m.methods, 'method', (f) => `Function ${this.cls}:${f.name}(...)`);
    group('Events', m.events, 'event', (e) => `Event ${this.cls}.${e.name}`);
  }

  reload() {}

  show(on) {
    this.el.style.display = on ? '' : 'none';
  }

  dispose() {
    this.el.remove();
  }
}
