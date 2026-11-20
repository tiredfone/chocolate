import {
  EditorState, Compartment, StateField, StateEffect, RangeSetBuilder, Prec, Annotation,
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, highlightSpecialChars, hoverTooltip, gutter, GutterMarker, Decoration,
  StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, foldGutter, foldKeymap, foldService, foldAll, unfoldAll, indentUnit, indentService, codeFolding,
  defaultKeymap, history, historyKeymap, indentWithTab, addCursorAbove, addCursorBelow, insertNewlineAndIndent,
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, acceptCompletion, startCompletion,
  search, searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine, findNext, findPrevious, selectNextOccurrence,
  tags,
} from './vendor/codemirror.js';
import { completions, describeAt, KEYWORDS, GLOBALS, LIBS } from './reference.js';
import { el } from './ui.js';

const LUAU_WORDS = new Set([...KEYWORDS, 'continue']);
const ATOMS = new Set(['true', 'false', 'nil']);
const BUILTINS = new Set([...Object.keys(GLOBALS), ...Object.keys(LIBS)]);
const OPENERS = /\b(function|do|then|repeat)\b/g;
const CLOSERS = /\b(end|until|else|elseif)\b/g;

const T = {
  kw: tags.keyword,
  atom: tags.atom,
  builtin: tags.standard(tags.variableName),
  fn: tags.function(tags.definition(tags.variableName)),
  local: tags.definition(tags.variableName),
  prop: tags.propertyName,
  method: tags.function(tags.propertyName),
  str: tags.string,
  num: tags.number,
  com: tags.comment,
  op: tags.operator,
  self: tags.self,
  meta: tags.meta,
  type: tags.typeName,
};

const luauParser = {
  name: 'luau',
  startState: () => ({ long: -1, comment: false, prev: '', prevTok: '' }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (state.long >= 0) {
      const close = ']' + '='.repeat(state.long) + ']';
      const at = stream.string.indexOf(close, stream.pos);
      if (at < 0) {
        stream.skipToEnd();
      } else {
        stream.pos = at + close.length;
        state.long = -1;
      }
      return state.comment ? 'com' : 'str';
    }
    if (stream.eatSpace()) return null;
    const prev = state.prev;
    state.prev = '';
    if (stream.match(/^--\[(=*)\[/, false)) {
      const m = stream.match(/^--\[(=*)\[/);
      state.long = m[1].length;
      state.comment = true;
      const close = ']' + '='.repeat(state.long) + ']';
      const at = stream.string.indexOf(close, stream.pos);
      if (at < 0) stream.skipToEnd();
      else {
        stream.pos = at + close.length;
        state.long = -1;
      }
      return 'com';
    }
    if (stream.match(/^--/)) {
      stream.skipToEnd();
      return 'com';
    }
    const lm = stream.match(/^\[(=*)\[/, false);
    if (lm) {
      stream.match(/^\[(=*)\[/);
      state.long = lm[1].length;
      state.comment = false;
      const close = ']' + '='.repeat(state.long) + ']';
      const at = stream.string.indexOf(close, stream.pos);
      if (at < 0) stream.skipToEnd();
      else {
        stream.pos = at + close.length;
        state.long = -1;
      }
      return 'str';
    }
    const q = stream.peek();
    if (q === '"' || q === "'" || q === '`') {
      stream.next();
      let esc = false;
      let c;
      while ((c = stream.next()) != null) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === q) break;
      }
      return 'str';
    }
    if (stream.match(/^0[xX][0-9a-fA-F_]+/) || stream.match(/^0[bB][01_]+/) || stream.match(/^\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?/) || stream.match(/^\.\d+(?:[eE][+-]?\d+)?/)) return 'num';
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const w = stream.current();
      if (prev === 'function') return 'fn';
      if (prev === 'local') return LUAU_WORDS.has(w) ? 'kw' : 'local';
      if (prev === '.' || prev === ':') {
        state.prev = '';
        return stream.peek() === '(' || prev === ':' ? 'method' : 'prop';
      }
      if (prev === '::') return 'type';
      if (LUAU_WORDS.has(w)) {
        state.prev = w === 'function' || w === 'local' ? w : '';
        return 'kw';
      }
      if (ATOMS.has(w)) return 'atom';
      if (w === 'self') return 'self';
      if (w === 'type' || w === 'export') {
        if (/^\s+[A-Za-z_]/.test(stream.string.slice(stream.pos)) && stream.string.slice(0, stream.start).trim() === '') {
          state.prev = 'function';
          return 'kw';
        }
      }
      if (BUILTINS.has(w)) return 'builtin';
      return null;
    }
    if (stream.match('::')) {
      state.prev = '::';
      return 'op';
    }
    if (stream.match('...')) return 'op';
    const c = stream.next();
    if (c === '.' || c === ':') {
      state.prev = c;
      return 'op';
    }
    if (c === '@') {
      stream.match(/^\w+/);
      return 'meta';
    }
    if (/[+\-*/%^#=<>~&|?]/.test(c)) return 'op';
    return null;
  },
  languageData: {
    commentTokens: { line: '--', block: { open: '--[[', close: ']]' } },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
    indentOnInput: /^\s*(?:end|else|elseif|until|[\]\)}])$/,
  },
  tokenTable: T,
};

const luau = StreamLanguage.define(luauParser);

const highlight = HighlightStyle.define([
  { tag: T.kw, class: 'tk-kw' },
  { tag: T.atom, class: 'tk-atom' },
  { tag: T.builtin, class: 'tk-builtin' },
  { tag: T.fn, class: 'tk-fn' },
  { tag: T.local, class: 'tk-local' },
  { tag: T.prop, class: 'tk-prop' },
  { tag: T.method, class: 'tk-method' },
  { tag: T.str, class: 'tk-str' },
  { tag: T.num, class: 'tk-num' },
  { tag: T.com, class: 'tk-com' },
  { tag: T.op, class: 'tk-op' },
  { tag: T.self, class: 'tk-self' },
  { tag: T.meta, class: 'tk-meta' },
  { tag: T.type, class: 'tk-type' },
]);

function codeOf(line) {
  return line.replace(/--.*$/, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

function netOf(code) {
  const opens = (code.match(OPENERS) || []).length + (/^\s*else\b(?!if)/.test(code) ? 1 : 0);
  const closes = (code.match(CLOSERS) || []).length;
  const br = (code.match(/[({\[]/g) || []).length - (code.match(/[)}\]]/g) || []).length;
  return opens - closes + br;
}

const LEAD_CLOSE = /^\s*(?:end\b|until\b|else\b|elseif\b|[)}\]])/;

function lineNet(text) {
  const code = codeOf(text);
  let net = netOf(code);
  if (LEAD_CLOSE.test(code)) net += 1;
  return net;
}

const luauIndent = indentService.of((ctx, pos) => {
  const doc = ctx.state.doc;
  const line = doc.lineAt(pos);
  const unit = ctx.unit;
  const head = line.text.slice(0, pos - line.from);
  if (head.trim()) return Math.max(0, ctx.lineIndent(line.from) + Math.max(-1, Math.min(2, lineNet(head))) * unit);
  let n = line.number - 1;
  while (n >= 1 && !doc.line(n).text.trim()) n--;
  if (n < 1) return 0;
  const prev = doc.line(n);
  let col = ctx.lineIndent(prev.from);
  col += Math.max(-1, Math.min(2, lineNet(prev.text))) * unit;
  if (LEAD_CLOSE.test(codeOf(line.text))) col -= unit;
  return Math.max(0, col);
});

const luauFold = foldService.of((state, lineStart) => {
  const doc = state.doc;
  const first = doc.lineAt(lineStart);
  const code = codeOf(first.text);
  if (/^\s*(?:end\b|until\b)/.test(code)) return null;
  let depth = netOf(code);
  if (depth <= 0) return null;
  for (let i = first.number + 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    depth += netOf(codeOf(l.text));
    if (depth <= 0) return l.from - 1 > first.to ? { from: first.to, to: l.from - 1 } : null;
  }
  return null;
});

const remote = Annotation.define();
const setMarksEffect = StateEffect.define();

const marksField = StateField.define({
  create: () => ({ bps: new Set(), current: 0 }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setMarksEffect)) return e.value;
    return v;
  },
});

class BpMarker extends GutterMarker {
  constructor(kind) {
    super();
    this.kind = kind;
  }
  eq(o) {
    return o.kind === this.kind;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'st-bp-' + this.kind;
    return s;
  }
}

const BP = new BpMarker('dot');
const BPCUR = new BpMarker('hit');
const CUR = new BpMarker('arrow');

const KIND_TYPE = { property: 'property', method: 'method', event: 'event', child: 'class', keyword: 'keyword', local: 'variable', function: 'function', global: 'variable', enum: 'enum', enumitem: 'constant', class: 'class' };

const mode = { value: 'auto', era: 2012 };

function resolvedTheme() {
  return mode.value === 'auto' ? (document.documentElement.classList.contains('st-dark') ? 'dark' : 'light') : mode.value;
}

export function setEditorTheme(value) {
  mode.value = value === 'dark' || value === 'light' ? value : 'auto';
  for (const e of document.querySelectorAll('.st-editor')) {
    e.classList.remove('st-ed-dark', 'st-ed-light');
    e.classList.add('st-ed-' + resolvedTheme());
  }
}

export class ScriptEditor {
  constructor(parent, script, onChange) {
    this.script = script;
    this.onChange = onChange;
    this.el = el('div', 'st-editor st-ed-' + resolvedTheme(), parent);
    this.code = this.el;
    this.readOnlyConf = new Compartment();
    this.onCommand = null;
    this.onGutter = null;
    let timer = null;
    this.timer = () => timer;
    const flush = () => {
      clearTimeout(timer);
      timer = null;
      onChange(this.text());
    };
    const acSource = (ctx) => {
      const text = ctx.state.doc.toString();
      const res = completions(text, ctx.pos, { dm: script.dm, script });
      if (!res) return null;
      if (!ctx.explicit && !res.word && !/[.:]$/.test(text.slice(0, ctx.pos)) && !res.string) return null;
      return {
        from: res.from,
        filter: false,
        options: res.items.map((it) => ({
          label: it.label,
          detail: it.detail,
          type: KIND_TYPE[it.kind] || 'text',
          apply: (view, c, from, to) => {
            let ins = it.insert;
            let back = 0;
            if (ins.endsWith('(')) {
              if (view.state.doc.sliceString(to, to + 1) === '(') ins = ins.slice(0, -1);
              else {
                ins += ')';
                back = 1;
              }
            }
            view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length - back }, userEvent: 'input.complete' });
          },
        })),
      };
    };
    const hover = hoverTooltip((view, pos) => {
      const d = describeAt(view.state.doc.toString(), pos, { dm: script.dm, script });
      if (!d) return null;
      return {
        pos: d.from,
        end: d.to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'st-hover';
          el('div', 'st-hover-title', dom, d.title);
          if (d.note) el('div', 'st-hover-note', dom, d.note);
          return { dom };
        },
      };
    }, { hoverTime: 350 });
    const bpGutter = gutter({
      class: 'st-bp-gutter',
      lineMarker(view, line) {
        const m = view.state.field(marksField);
        const n = view.state.doc.lineAt(line.from).number;
        if (m.bps.has(n)) return n === m.current ? BPCUR : BP;
        return n === m.current ? CUR : null;
      },
      lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setMarksEffect))),
      initialSpacer: () => BP,
      domEventHandlers: {
        mousedown: (view, line) => {
          const n = view.state.doc.lineAt(line.from).number;
          if (this.onGutter) this.onGutter(n);
          return true;
        },
      },
    });
    const curLine = EditorView.decorations.compute([marksField], (state) => {
      const m = state.field(marksField);
      if (!m.current || m.current > state.doc.lines) return Decoration.none;
      const b = new RangeSetBuilder();
      b.add(state.doc.line(m.current).from, state.doc.line(m.current).from, Decoration.line({ class: 'st-exec-line' }));
      return b.finish();
    });
    const enterEnd = (view) => {
      const { state } = view;
      const sel = state.selection.main;
      if (!sel.empty || state.selection.ranges.length > 1) return false;
      const line = state.doc.lineAt(sel.head);
      if (sel.head !== line.to) return false;
      const code = codeOf(line.text);
      if (!/\b(then|do)\s*$|\bfunction\b[^]*\)\s*$/.test(code) || /\bend\b\s*\)?$/.test(code)) return false;
      const all = codeOf(state.doc.toString().replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, ''));
      const opens = (all.match(/\b(function|do|then)\b/g) || []).length - (all.match(/\belseif\b/g) || []).length;
      const ends = (all.match(/\bend\b/g) || []).length;
      if (ends >= opens) return false;
      const indent = /^\s*/.exec(line.text)[0];
      const unit = state.facet(indentUnit);
      const body = indent + unit;
      view.dispatch({
        changes: { from: sel.head, insert: '\n' + body + '\n' + indent + 'end' },
        selection: { anchor: sel.head + 1 + body.length },
        scrollIntoView: true,
        userEvent: 'input',
      });
      return true;
    };
    const ctrl = (cmd) => () => {
      if (this.onCommand) this.onCommand(cmd);
      return true;
    };
    const extra = [
      { key: 'Mod-s', run: () => { flush(); onChange(this.text(), true); return true; }, preventDefault: true },
      { key: 'Mod-Shift-f', run: ctrl('findall'), preventDefault: true },
      { key: 'Mod-h', run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
      { key: 'Mod-g', run: gotoLine, preventDefault: true },
      { key: 'F3', run: findNext, shift: findPrevious, preventDefault: true },
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      { key: 'Mod-Alt-ArrowUp', run: addCursorAbove, preventDefault: true },
      { key: 'Mod-Alt-ArrowDown', run: addCursorBelow, preventDefault: true },
      { key: 'Mod-Space', run: startCompletion, preventDefault: true },
      { key: 'Tab', run: acceptCompletion },
      { key: 'Enter', run: enterEnd },
    ];
    const state = EditorState.create({
      doc: script.props.get('Source') || '',
      extensions: [
        marksField,
        bpGutter,
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter({ openText: '\u25be', closedText: '\u25b8' }),
        codeFolding({ placeholderText: '\u2026' }),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.clickAddsSelectionRange.of((e) => e.altKey),
        indentUnit.of('\t'),
        EditorState.tabSize.of(4),
        luau,
        luauIndent,
        luauFold,
        syntaxHighlighting(highlight),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [acSource], activateOnTyping: true, maxRenderedOptions: 80, defaultKeymap: false }),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        hover,
        curLine,
        this.readOnlyConf.of([]),
        EditorView.contentAttributes.of({ spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
        Prec.highest(keymap.of(extra)),
        keymap.of([...completionKeymap, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(remote))) {
            clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              onChange(this.text());
            }, 400);
          }
          if (u.focusChanged && !u.view.hasFocus) flush();
        }),
      ],
    });
    this.view = new EditorView({ state, parent: this.el });
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    this.readOnly = false;
    const v = this.view;
    const self = this;
    this.ta = {
      get value() {
        return v.state.doc.toString();
      },
      get selectionStart() {
        return v.state.selection.main.from;
      },
      get selectionEnd() {
        return v.state.selection.main.to;
      },
      get readOnly() {
        return self.readOnly;
      },
      set readOnly(on) {
        self.setReadOnly(on);
      },
      focus() {
        v.focus();
      },
      blur() {
        v.contentDOM.blur();
        flush();
      },
      select() {
        v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
      },
      setSelectionRange(a, b) {
        v.dispatch({ selection: { anchor: a, head: b }, effects: EditorView.scrollIntoView(a, { y: 'center' }) });
      },
      setRangeText(text, a, b, selMode) {
        const end = a + text.length;
        const sel = selMode === 'select' ? { anchor: a, head: end } : selMode === 'start' ? { anchor: a } : { anchor: end };
        v.dispatch({ changes: { from: a, to: b, insert: text }, selection: sel });
      },
      dispatchEvent() {
        return true;
      },
    };
  }

  setReadOnly(on) {
    this.readOnly = !!on;
    this.view.dispatch({ effects: this.readOnlyConf.reconfigure(on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
  }

  text() {
    return this.view.state.doc.toString();
  }

  insert(text, caretAt, selEnd) {
    const v = this.view;
    const r = v.state.selection.main;
    v.dispatch({
      changes: { from: r.from, to: r.to, insert: text },
      selection: { anchor: r.from + caretAt, head: r.from + (selEnd ?? caretAt) },
      scrollIntoView: true,
      userEvent: 'input',
    });
  }

  setMarks(bps, current) {
    this.view.dispatch({ effects: setMarksEffect.of({ bps: new Set(bps), current: current | 0 }) });
    if (current && current <= this.view.state.doc.lines) this.view.dispatch({ effects: EditorView.scrollIntoView(this.view.state.doc.line(current).from, { y: 'center' }) });
  }

  fold() {
    foldAll(this.view);
  }

  unfold() {
    unfoldAll(this.view);
  }

  openFind() {
    this.view.focus();
    openSearchPanel(this.view);
  }

  openGoto() {
    this.view.focus();
    gotoLine(this.view);
  }

  findNext(dir) {
    this.view.focus();
    return dir < 0 ? findPrevious(this.view) : findNext(this.view);
  }

  reload() {
    if (this.view.hasFocus) return;
    const v = this.script.props.get('Source') || '';
    const cur = this.text();
    if (v === cur) return;
    this.view.dispatch({ changes: { from: 0, to: cur.length, insert: v }, annotations: remote.of(true) });
  }

  show(on) {
    this.el.style.display = on ? '' : 'none';
    if (on) this.view.requestMeasure();
  }

  dispose() {
    this.view.destroy();
    this.el.remove();
  }
}
