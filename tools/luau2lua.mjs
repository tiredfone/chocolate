import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const KW = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const OPS3 = ['...', '..=', '//='];
const OPS2 = ['::', '->', '==', '~=', '<=', '>=', '..', '+=', '-=', '*=', '/=', '%=', '^=', '//'];
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=', '^=', '..=', '//=']);
const BINOPS = new Set(['+', '-', '*', '/', '%', '^', '..', '==', '~=', '<', '>', '<=', '>=', '//']);
const EXPR_PREV_OPS = new Set(['=', '(', ',', '{', '[', '+', '-', '*', '/', '%', '^', '..', '==', '~=', '<', '>', '<=', '>=', '#', '//', '+=', '-=', '*=', '/=', '%=', '^=', '..=', '//=', '?', ':']);
const EXPR_PREV_KW = new Set(['return', 'and', 'or', 'not', 'in']);
const PAIRS_CALLS = /^(Get\w*s|GetChildren|GetDescendants|GetPlayers|FindPartsIn\w+)$/;

const tk = (k, s) => ({ k, s });
const isWs = (t) => t.k === 'ws' || t.k === 'cm';

function longBracket(src, i) {
  const m = /^\[(=*)\[/.exec(src.slice(i, i + 40));
  if (!m) return -1;
  const close = ']' + m[1] + ']';
  const e = src.indexOf(close, i + m[0].length);
  return e < 0 ? src.length : e + close.length;
}

function utf8Escape(cp) {
  return [...Buffer.from(String.fromCodePoint(cp), 'utf8')].map((b) => '\\' + String(b).padStart(3, '0')).join('');
}

function lex(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      out.push(tk('ws', src.slice(i, j)));
      i = j;
    } else if (c === '-' && src[i + 1] === '-') {
      let e;
      if (src[i + 2] === '[' && longBracket(src, i + 2) >= 0) e = longBracket(src, i + 2);
      else {
        e = src.indexOf('\n', i);
        if (e < 0) e = n;
      }
      out.push(tk('cm', src.slice(i, e)));
      i = e;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let changed = false;
      let s = c;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') {
          const m = /^\\u\{([0-9a-fA-F]+)\}/.exec(src.slice(j, j + 14));
          if (m) {
            s += utf8Escape(parseInt(m[1], 16));
            j += m[0].length;
            changed = true;
            continue;
          }
          if (src[j + 1] === 'z') {
            let q = j + 2;
            while (q < n && /\s/.test(src[q])) q++;
            j = q;
            changed = true;
            continue;
          }
          s += src[j] + (src[j + 1] || '');
          j += 2;
        } else {
          s += src[j];
          j++;
        }
      }
      s += c;
      j++;
      out.push(tk('str', changed ? s : src.slice(i, j)));
      i = j;
    } else if (c === '`') {
      let j = i + 1;
      const parts = [];
      let lit = '';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') {
          const d = src[j + 1];
          if (d === '{' || d === '`') lit += d === '`' ? '`' : '{';
          else lit += src[j] + (d || '');
          j += 2;
        } else if (src[j] === '{') {
          let depth = 1;
          let q = j + 1;
          while (q < n && depth > 0) {
            if (src[q] === '{') depth++;
            else if (src[q] === '}') depth--;
            else if (src[q] === '"' || src[q] === "'") {
              const qc = src[q];
              q++;
              while (q < n && src[q] !== qc) q += src[q] === '\\' ? 2 : 1;
            }
            if (depth > 0) q++;
          }
          parts.push({ lit });
          lit = '';
          parts.push({ expr: src.slice(j + 1, q) });
          j = q + 1;
        } else {
          lit += src[j] === '\n' ? '\\n' : src[j] === '"' ? '\\"' : src[j];
          j++;
        }
      }
      parts.push({ lit });
      const pieces = [];
      for (const p of parts) {
        if (p.expr !== undefined) {
          pieces.push([tk('name', 'tostring'), tk('op', '('), ...lex(p.expr), tk('op', ')')]);
        } else if (p.lit !== '' || parts.length === 1) pieces.push([tk('str', '"' + p.lit + '"')]);
      }
      out.push(tk('op', '('));
      pieces.forEach((p, idx) => {
        if (idx) out.push(tk('ws', ' '), tk('op', '..'), tk('ws', ' '));
        out.push(...p);
      });
      out.push(tk('op', ')'));
      i = j + 1;
    } else if (c === '[' && longBracket(src, i) >= 0) {
      const e = longBracket(src, i);
      out.push(tk('str', src.slice(i, e)));
      i = e;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      out.push(tk(KW.has(w) ? 'kw' : 'name', w));
      i = j;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 80));
      let s = m[0];
      const orig = s;
      if (/^0[bB]/.test(s)) s = String(parseInt(s.slice(2).replace(/_/g, ''), 2));
      else if (s.includes('_')) s = s.replace(/_/g, '');
      out.push(tk('num', s === orig ? orig : s));
      i += orig.length;
    } else {
      let op = null;
      const s3 = src.slice(i, i + 3);
      const s2 = src.slice(i, i + 2);
      if (OPS3.includes(s3)) op = s3;
      else if (OPS2.includes(s2)) op = s2;
      else op = c;
      out.push(tk('op', op));
      i += op.length;
    }
  }
  return out;
}

class Conv {
  constructor(toks) {
    this.t = toks;
    this.uid = 0;
  }
  nx(i) {
    const t = this.t;
    while (i < t.length && isWs(t[i])) i++;
    return i;
  }
  pv(i) {
    const t = this.t;
    while (i >= 0 && isWs(t[i])) i--;
    return i;
  }
  is(i, s) {
    const x = this.t[i];
    return !!x && x.s === s && (x.k === 'op' || x.k === 'kw');
  }
  match(i) {
    const t = this.t;
    let d = 0;
    for (let j = i; j < t.length; j++) {
      const x = t[j];
      if (x.k !== 'op') continue;
      if (x.s === '(' || x.s === '[' || x.s === '{') d++;
      else if (x.s === ')' || x.s === ']' || x.s === '}') {
        d--;
        if (d === 0) return j;
      }
    }
    return t.length - 1;
  }
  matchBack(i) {
    const t = this.t;
    let d = 0;
    for (let j = i; j >= 0; j--) {
      const x = t[j];
      if (x.k !== 'op') continue;
      if (x.s === ')' || x.s === ']' || x.s === '}') d++;
      else if (x.s === '(' || x.s === '[' || x.s === '{') {
        d--;
        if (d === 0) return j;
      }
    }
    return 0;
  }
  matchAngle(i) {
    const t = this.t;
    let d = 0;
    for (let j = i; j < t.length; j++) {
      const x = t[j];
      if (x.k !== 'op') continue;
      if (x.s === '<') d++;
      else if (x.s === '>') {
        d--;
        if (d === 0) return j;
      }
    }
    return t.length - 1;
  }
  exprPos(i) {
    const p = this.pv(i - 1);
    if (p < 0) return false;
    const x = this.t[p];
    if (x.k === 'op') return EXPR_PREV_OPS.has(x.s) && !(x.s === ':' && false);
    if (x.k === 'kw') return EXPR_PREV_KW.has(x.s);
    return false;
  }
  isIfExpr(i) {
    const p = this.pv(i - 1);
    if (p < 0) return false;
    const x = this.t[p];
    if (x.k === 'op') return x.s !== ':' && x.s !== '?' && EXPR_PREV_OPS.has(x.s);
    if (x.k === 'kw') return EXPR_PREV_KW.has(x.s);
    return false;
  }
  blockEnd(i) {
    const t = this.t;
    let d = 0;
    for (let j = i; j < t.length; j++) {
      const x = t[j];
      if (x.k !== 'kw') continue;
      if (x.s === 'function' || x.s === 'do' || x.s === 'repeat' || (x.s === 'if' && !this.isIfExpr(j))) d++;
      else if (x.s === 'end' || x.s === 'until') {
        d--;
        if (d === 0) return j;
      }
    }
    return t.length - 1;
  }
  sameLine(a, b) {
    for (let j = a + 1; j < b; j++) if (this.t[j].s.includes('\n')) return false;
    return true;
  }
  primaryLast(i) {
    const t = this.t;
    let j = this.nx(i);
    const x = t[j];
    let last;
    if (!x) return t.length - 1;
    if (x.k === 'kw' && x.s === 'function') return this.blockEnd(j);
    if (x.k === 'op' && x.s === '(') last = this.match(j);
    else if (x.k === 'op' && x.s === '{') return this.match(j);
    else last = j;
    for (;;) {
      const n = this.nx(last + 1);
      const y = t[n];
      if (!y) break;
      if (y.k === 'op' && y.s === '.' && t[this.nx(n + 1)] && t[this.nx(n + 1)].k === 'name') last = this.nx(n + 1);
      else if (y.k === 'op' && y.s === ':' && t[this.nx(n + 1)] && t[this.nx(n + 1)].k === 'name') {
        const nn = this.nx(this.nx(n + 1) + 1);
        const z = t[nn];
        if (z && z.k === 'op' && z.s === '(') last = this.match(nn);
        else if (z && (z.k === 'str' || (z.k === 'op' && z.s === '{'))) last = z.k === 'str' ? nn : this.match(nn);
        else break;
      } else if (y.k === 'op' && y.s === '[') last = this.match(n);
      else if (y.k === 'op' && y.s === '(' && this.sameLine(last, n)) last = this.match(n);
      else if (y.k === 'str' && this.sameLine(last, n) && (t[last].k === 'name' || t[last].s === ')' || t[last].s === ']')) last = n;
      else if (y.k === 'op' && y.s === '{' && this.sameLine(last, n) && (t[last].k === 'name' || t[last].s === ')' || t[last].s === ']')) last = this.match(n);
      else break;
    }
    return last;
  }
  operandLast(i) {
    const t = this.t;
    const j = this.nx(i);
    const x = t[j];
    if (!x) return t.length - 1;
    if ((x.k === 'kw' && x.s === 'not') || (x.k === 'op' && (x.s === '-' || x.s === '#'))) return this.operandLast(j + 1);
    if (x.k === 'kw' && x.s === 'if') return this.ifParse(j).last;
    return this.primaryLast(j);
  }
  exprLast(i) {
    let last = this.operandLast(i);
    for (;;) {
      const n = this.nx(last + 1);
      const y = this.t[n];
      if (y && y.k === 'op' && BINOPS.has(y.s)) last = this.operandLast(n + 1);
      else if (y && y.k === 'kw' && (y.s === 'and' || y.s === 'or')) last = this.operandLast(n + 1);
      else if (y && y.k === 'op' && y.s === '::') last = this.typeLast(this.nx(n + 1));
      else break;
    }
    return last;
  }
  ifParse(i) {
    const conds = [];
    const vals = [];
    let j = i;
    for (;;) {
      const c0 = this.nx(j + 1);
      const c1 = this.exprLast(c0);
      const th = this.nx(c1 + 1);
      const v0 = this.nx(th + 1);
      const v1 = this.exprLast(v0);
      conds.push([c0, c1]);
      vals.push([v0, v1]);
      const n = this.nx(v1 + 1);
      if (this.is(n, 'elseif')) {
        j = n;
        continue;
      }
      const e0 = this.nx(n + 1);
      const e1 = this.exprLast(e0);
      return { conds, vals, other: [e0, e1], last: e1 };
    }
  }
  slice(a, b) {
    return this.t.slice(a, b + 1).map((x) => ({ ...x }));
  }
  truthyLiteral(a, b) {
    const x = this.t[a];
    if (a === b) return x.k === 'num' || (x.k === 'str') || (x.k === 'kw' && x.s === 'true');
    if (x.k === 'op' && x.s === '{' && this.match(a) === b) return true;
    if (x.k === 'kw' && x.s === 'function') return true;
    return false;
  }
  killRange(a, b) {
    for (let j = a; j <= b; j++) this.t[j] = tk('ws', '');
  }
  typeLast(i) {
    let j = i;
    if (this.is(j, '|') || this.is(j, '&')) j = this.nx(j + 1);
    for (;;) {
      j = this.simpleTypeLast(j);
      let n = this.nx(j + 1);
      while (this.is(n, '?')) {
        j = n;
        n = this.nx(j + 1);
      }
      if (this.is(n, '|') || this.is(n, '&')) j = this.nx(n + 1);
      else return j;
    }
  }
  simpleTypeLast(j) {
    const t = this.t;
    const x = t[j];
    if (!x) return t.length - 1;
    if (x.k === 'op' && x.s === '<') {
      const e = this.matchAngle(j);
      return this.simpleTypeLast(this.nx(e + 1));
    }
    if (x.k === 'op' && x.s === '(') {
      const e = this.match(j);
      const n = this.nx(e + 1);
      if (this.is(n, '->')) return this.typeLast(this.nx(n + 1));
      return e;
    }
    if (x.k === 'op' && x.s === '{') return this.match(j);
    if (x.k === 'op' && x.s === '...') return this.typeLast(this.nx(j + 1));
    if (x.k === 'str' || (x.k === 'kw' && (x.s === 'nil' || x.s === 'true' || x.s === 'false'))) return j;
    if (x.k === 'name' && x.s === 'typeof' && this.is(this.nx(j + 1), '(')) return this.match(this.nx(j + 1));
    let last = j;
    for (;;) {
      const n = this.nx(last + 1);
      if (this.is(n, '.') && t[this.nx(n + 1)] && t[this.nx(n + 1)].k === 'name') last = this.nx(n + 1);
      else if (this.is(n, '<')) {
        last = this.matchAngle(n);
        break;
      } else break;
    }
    return last;
  }
  passTypes() {
    const t = this.t;
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (x.k === 'kw' && x.s === 'local') {
        let j = this.nx(i + 1);
        if (this.is(j, 'function')) continue;
        for (;;) {
          if (!t[j] || t[j].k !== 'name') break;
          let k = this.nx(j + 1);
          if (this.is(k, ':')) {
            const e = this.typeLast(this.nx(k + 1));
            this.killRange(k, e);
            k = this.nx(e + 1);
          }
          if (this.is(k, ',')) j = this.nx(k + 1);
          else break;
        }
      } else if (x.k === 'kw' && x.s === 'function') {
        let j = this.nx(i + 1);
        while (t[j] && ((t[j].k === 'name') || this.is(j, '.') || this.is(j, ':'))) j = this.nx(j + 1);
        if (this.is(j, '<')) {
          const e = this.matchAngle(j);
          this.killRange(j, e);
          j = this.nx(e + 1);
        }
        if (!this.is(j, '(')) continue;
        const close = this.match(j);
        let k = this.nx(j + 1);
        while (k < close) {
          if ((t[k].k === 'name' || this.is(k, '...')) && this.is(this.nx(k + 1), ':')) {
            const c = this.nx(k + 1);
            const e = this.typeLast(this.nx(c + 1));
            this.killRange(c, e);
            k = this.nx(e + 1);
          } else k = this.nx(k + 1);
        }
        const n = this.nx(close + 1);
        if (this.is(n, ':')) {
          const e = this.typeLast(this.nx(n + 1));
          this.killRange(n, e);
        }
      } else if (x.k === 'op' && x.s === '::') {
        const e = this.typeLast(this.nx(i + 1));
        this.killRange(i, e);
      } else if (x.k === 'name' && (x.s === 'type' || x.s === 'export')) {
        const p = this.pv(i - 1);
        if (p >= 0 && (this.is(p, '.') || this.is(p, ':'))) continue;
        let s = i;
        let j = this.nx(i + 1);
        if (x.s === 'export') {
          if (!(t[j] && t[j].k === 'name' && t[j].s === 'type')) continue;
          j = this.nx(j + 1);
        }
        if (!(t[j] && t[j].k === 'name')) continue;
        let k = this.nx(j + 1);
        if (this.is(k, '<')) k = this.nx(this.matchAngle(k) + 1);
        if (!this.is(k, '=')) continue;
        const e = this.typeLast(this.nx(k + 1));
        this.killRange(s, e);
      }
    }
  }
  ifText(info) {
    const parts = [];
    const all = info.vals.concat([info.other]);
    const simple = all.every(([a, b]) => this.truthyLiteral(a, b) || false) || all.slice(0, -1).every(([a, b]) => this.truthyLiteral(a, b));
    const out = [tk('op', '(')];
    if (simple) {
      info.conds.forEach(([a, b], idx) => {
        out.push(...this.slice(a, b), tk('ws', ' '), tk('kw', 'and'), tk('ws', ' '), ...this.slice(info.vals[idx][0], info.vals[idx][1]), tk('ws', ' '), tk('kw', 'or'), tk('ws', ' '));
      });
      out.push(...this.slice(info.other[0], info.other[1]));
      out.push(tk('op', ')'));
      return out;
    }
    const body = [];
    info.conds.forEach(([a, b], idx) => {
      body.push(tk('kw', idx === 0 ? 'if' : 'elseif'), tk('ws', ' '), ...this.slice(a, b), tk('ws', ' '), tk('kw', 'then'), tk('ws', ' '), tk('kw', 'return'), tk('ws', ' '), tk('op', '('), ...this.slice(info.vals[idx][0], info.vals[idx][1]), tk('op', ')'), tk('ws', ' '));
    });
    body.push(tk('kw', 'else'), tk('ws', ' '), tk('kw', 'return'), tk('ws', ' '), tk('op', '('), ...this.slice(info.other[0], info.other[1]), tk('op', ')'), tk('ws', ' '), tk('kw', 'end'));
    if (body.some((x) => x.k === 'op' && x.s === '...')) throw new Error('if-expression uses ... and cannot be wrapped');
    out.push(tk('op', '('), tk('kw', 'function'), tk('op', '('), tk('op', ')'), tk('ws', ' '), ...body, tk('ws', ' '), tk('kw', 'end'), tk('op', ')'), tk('op', '('), tk('op', ')'), tk('op', ')'));
    return out;
  }
  passIfExpr() {
    for (;;) {
      let idx = -1;
      for (let i = this.t.length - 1; i >= 0; i--) {
        const x = this.t[i];
        if (x.k === 'kw' && x.s === 'if' && this.isIfExpr(i)) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return;
      const info = this.ifParse(idx);
      const repl = this.ifText(info);
      this.t.splice(idx, info.last - idx + 1, ...repl);
    }
  }
  walkBack(e) {
    const t = this.t;
    let s = e;
    for (;;) {
      const x = t[s];
      if (x.k === 'num' || x.k === 'str') return s;
      if (x.k === 'op' && (x.s === ']' || x.s === ')')) {
        const o = this.matchBack(s);
        const p = this.pv(o - 1);
        if (x.s === ')') {
          if (p >= 0 && (t[p].k === 'name' || this.is(p, ']') || this.is(p, ')'))) {
            s = p;
            continue;
          }
          return o;
        }
        if (p < 0) return o;
        s = p;
        continue;
      }
      if (x.k === 'name') {
        const p = this.pv(s - 1);
        if (p >= 0 && (this.is(p, '.') || this.is(p, ':'))) {
          s = this.pv(p - 1);
          continue;
        }
        return s;
      }
      return s;
    }
  }
  passCompound() {
    for (;;) {
      let c = -1;
      for (let i = this.t.length - 1; i >= 0; i--) {
        const x = this.t[i];
        if (x.k === 'op' && COMPOUND.has(x.s)) {
          c = i;
          break;
        }
      }
      if (c < 0) return;
      const op = this.t[c].s.slice(0, -1);
      const e = this.pv(c - 1);
      const s = this.walkBack(e);
      const r0 = this.nx(c + 1);
      const r1 = this.exprLast(r0);
      const target = () => this.slice(s, e);
      const rhs = r0 === r1 && this.t[r0].k !== 'op' ? this.slice(r0, r1) : [tk('op', '('), ...this.slice(r0, r1), tk('op', ')')];
      const sp = () => tk('ws', ' ');
      const combine = (lhs) => {
        if (op === '//') return [tk('name', 'math'), tk('op', '.'), tk('name', 'floor'), tk('op', '('), ...lhs, sp(), tk('op', '/'), sp(), ...rhs, tk('op', ')')];
        return [...lhs, sp(), tk('op', op), sp(), ...rhs];
      };
      const hasCall = this.t.slice(s, e + 1).some((x) => x.k === 'op' && x.s === '(');
      let repl;
      if (!hasCall) {
        repl = [...target(), sp(), tk('op', '='), sp(), ...combine(target())];
      } else {
        let lastOpen;
        if (this.t[e].s === ']') lastOpen = this.matchBack(e);
        else lastOpen = this.pv(e - 1);
        const base = this.slice(s, this.pv(lastOpen - 1));
        const key = this.t[e].s === ']' ? this.slice(this.nx(lastOpen + 1), this.pv(e - 1)) : [tk('str', '"' + this.t[e].s + '"')];
        const ct = tk('name', '__ct');
        const ck = tk('name', '__ck');
        const ref = () => [{ ...ct }, tk('op', '['), { ...ck }, tk('op', ']')];
        repl = [tk('kw', 'do'), sp(), tk('kw', 'local'), sp(), { ...ct }, tk('op', ','), sp(), { ...ck }, sp(), tk('op', '='), sp(), ...base, tk('op', ','), sp(), ...key, tk('op', ';'), sp(), ...ref(), sp(), tk('op', '='), sp(), ...combine(ref()), sp(), tk('kw', 'end')];
      }
      this.t.splice(s, r1 - s + 1, ...repl);
    }
  }
  passIntDiv() {
    for (;;) {
      let c = -1;
      for (let i = this.t.length - 1; i >= 0; i--) {
        const x = this.t[i];
        if (x.k === 'op' && x.s === '//') {
          c = i;
          break;
        }
      }
      if (c < 0) return;
      const e = this.pv(c - 1);
      const s = this.walkBack(e);
      const r0 = this.nx(c + 1);
      const r1 = this.operandLast(r0);
      const repl = [tk('name', 'math'), tk('op', '.'), tk('name', 'floor'), tk('op', '('), ...this.slice(s, e), tk('ws', ' '), tk('op', '/'), tk('ws', ' '), ...this.slice(r0, r1), tk('op', ')')];
      this.t.splice(s, r1 - s + 1, ...repl);
    }
  }
  passContinue() {
    const t = this.t;
    const isContinue = (i) => {
      const x = t[i];
      if (!(x.k === 'name' && x.s === 'continue')) return false;
      const p = this.pv(i - 1);
      if (p >= 0 && (this.is(p, '.') || this.is(p, ':') || this.is(p, 'local') || this.is(p, 'function') || this.is(p, ','))) return false;
      const n = this.nx(i + 1);
      const y = t[n];
      if (y && y.k === 'op' && (y.s === '=' || y.s === '(' || y.s === '.' || y.s === ':' || y.s === ',' || y.s === '[' || y.s === '{' || COMPOUND.has(y.s))) return false;
      if (y && y.k === 'str') return false;
      return true;
    };
    if (!t.some((x, i) => x.k === 'name' && x.s === 'continue' && isContinue(i))) return;
    const stack = [];
    const loops = [];
    const conts = [];
    const brks = [];
    const innermost = () => {
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].kind === 'func') return null;
        if (stack[j].kind === 'loop' || stack[j].kind === 'repeat') return stack[j];
      }
      return null;
    };
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (x.k === 'kw') {
        if (x.s === 'for' || x.s === 'while') stack.push({ kind: 'pending' });
        else if (x.s === 'do') {
          const top = stack[stack.length - 1];
          if (top && top.kind === 'pending') {
            top.kind = 'loop';
            top.open = i;
            top.id = ++this.uid;
            loops.push(top);
          } else stack.push({ kind: 'block' });
        } else if (x.s === 'function') stack.push({ kind: 'func' });
        else if (x.s === 'if') stack.push({ kind: 'block' });
        else if (x.s === 'repeat') {
          const e = { kind: 'repeat', open: i, id: ++this.uid };
          loops.push(e);
          stack.push(e);
        } else if (x.s === 'end') {
          const e = stack.pop();
          if (e && e.kind === 'loop') e.close = i;
        } else if (x.s === 'until') {
          const e = stack.pop();
          if (e && e.kind === 'repeat') e.close = i;
        } else if (x.s === 'break') {
          const l = innermost();
          if (l) brks.push([i, l]);
        }
      } else if (x.k === 'name' && x.s === 'continue' && isContinue(i)) {
        const l = innermost();
        if (l) {
          l.cont = true;
          conts.push([i, l]);
        }
      }
    }
    const before = new Map();
    const replace = new Map();
    const add = (m, i, s) => m.set(i, (m.get(i) || '') + s);
    for (const l of loops) {
      if (!l.cont || l.close === undefined) continue;
      const hasBreak = brks.some(([, q]) => q === l);
      const name = '__brk' + l.id;
      add(before, l.open + 1, (hasBreak ? ' local ' + name + ' = false' : '') + ' repeat ');
      add(before, l.close, ' until true ' + (hasBreak ? 'if ' + name + ' then break end ' : ''));
      l.name = name;
      l.hasBreak = hasBreak;
    }
    for (const [i, l] of conts) replace.set(i, 'do break end');
    for (const [i, l] of brks) if (l.cont && l.hasBreak) replace.set(i, 'do ' + l.name + ' = true break end');
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (before.has(i)) out.push(tk('ws', before.get(i)));
      if (replace.has(i)) out.push(tk('ws', replace.get(i)));
      else out.push(t[i]);
    }
    if (before.has(t.length)) out.push(tk('ws', before.get(t.length)));
    this.t = out;
  }
  passIter() {
    for (let i = this.t.length - 1; i >= 0; i--) {
      const x = this.t[i];
      if (!(x.k === 'kw' && x.s === 'for')) continue;
      let j = this.nx(i + 1);
      let ok = true;
      while (this.t[j] && this.t[j].k === 'name') {
        j = this.nx(j + 1);
        if (this.is(j, ',')) j = this.nx(j + 1);
        else break;
      }
      if (!this.is(j, 'in')) continue;
      const a = this.nx(j + 1);
      const b = this.exprLast(a);
      if (!this.is(this.nx(b + 1), 'do')) continue;
      const first = this.t[a];
      let wrap = null;
      if (first.k === 'op' && first.s === '{' && this.match(a) === b) wrap = 'pairs';
      else if (first.k === 'str' || first.k === 'num') continue;
      else {
        const last = this.t[b];
        if (last.s === ')' && last.k === 'op') {
          const o = this.matchBack(b);
          const p = this.pv(o - 1);
          if (p >= 0 && this.t[p].k === 'name' && PAIRS_CALLS.test(this.t[p].s)) {
            const q = this.pv(p - 1);
            if (q >= 0 && (this.is(q, ':') || this.is(q, '.'))) wrap = 'pairs';
          }
        } else if (last.k === 'name' || (last.s === ']' && last.k === 'op')) {
          let chain = true;
          for (let q = a; q <= b; q++) {
            const y = this.t[q];
            if (y.k === 'op' && (y.s === '(' || y.s === ':')) chain = false;
            if (y.k === 'kw' || y.k === 'str' && false) chain = false;
          }
          if (chain && first.k === 'name') wrap = 'poly';
        }
      }
      if (!wrap) continue;
      const inner = this.slice(a, b);
      let repl;
      if (wrap === 'pairs') repl = [tk('name', 'pairs'), tk('op', '('), ...inner, tk('op', ')')];
      else repl = lex('(function(t) if type(t) == "table" then return next, t end return t end)(').concat(inner, [tk('op', ')')]);
      this.t.splice(a, b - a + 1, ...repl);
    }
  }
  text() {
    return this.t.map((x) => x.s).join('');
  }
}

const MARKERS = /\+=|-=|\*=|\/=|%=|\^=|\.\.=|\/\/|::|->|\bcontinue\b|\bif\b[^\n]*\bthen\b|`|\btype\b|\bexport\b|\bfor\b|0[bB]|\d_\d|\\u\{|\\z|<[A-Za-z]|:\s*[A-Za-z{(]/;

export function convert(src) {
  if (!MARKERS.test(src)) return src;
  const c = new Conv(lex(src));
  c.passTypes();
  c.passIfExpr();
  c.passCompound();
  c.passIntDiv();
  c.passContinue();
  c.passIter();
  return c.text();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const inFile = args.find((a) => !a.startsWith('-'));
  const oi = args.indexOf('-o');
  const src = readFileSync(inFile || 0, 'utf8');
  const out = convert(src);
  if (oi >= 0) writeFileSync(args[oi + 1], out);
  else process.stdout.write(out);
}
