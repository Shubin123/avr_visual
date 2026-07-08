// Expression evaluator for .equ/.set/.if and instruction-operand constants.
// Values are JS numbers (float64) throughout — course code relies on
// assembly-time floating point (e.g. `CLOCK/PRESCALE_DIV*DELAY3`), truncated
// only where INT()/an instruction operand demands an integer.

export class ExprError extends Error {}

type TokenType = 'num' | 'ident' | 'str' | 'char' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';
interface Token {
  type: TokenType;
  text: string;
  value?: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', text: c });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', text: c });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: 'comma', text: c });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let out = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) {
          out += unescapeChar(src[j + 1]);
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      tokens.push({ type: 'str', text: out });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let ch: string;
      if (src[j] === '\\' && j + 1 < n) {
        ch = unescapeChar(src[j + 1]);
        j += 2;
      } else {
        ch = src[j] ?? '';
        j += 1;
      }
      if (src[j] !== "'") throw new ExprError(`Unterminated character literal in "${src}"`);
      tokens.push({ type: 'char', text: ch, value: ch.charCodeAt(0) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2;
        while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
        tokens.push({ type: 'num', text: src.slice(i, j), value: parseInt(src.slice(i + 2, j), 16) });
        i = j;
        continue;
      }
      if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2;
        while (j < n && /[01]/.test(src[j])) j++;
        tokens.push({ type: 'num', text: src.slice(i, j), value: parseInt(src.slice(i + 2, j), 2) });
        i = j;
        continue;
      }
      // decimal / float, with optional exponent (e.g. 16.0e6)
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.') {
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (/[0-9]/.test(src[k] ?? '')) {
          j = k;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
      }
      const text = src.slice(i, j);
      tokens.push({ type: 'num', text, value: parseFloat(text) });
      i = j;
      continue;
    }
    if (/[A-Za-z_.]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', text: src.slice(i, j) });
      i = j;
      continue;
    }
    // multi-char operators
    const two = src.slice(i, i + 2);
    if (['<<', '>>', '==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'op', text: two });
      i += 2;
      continue;
    }
    if ('+-*/%&|^~!<>'.includes(c)) {
      tokens.push({ type: 'op', text: c });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character '${c}' in expression "${src}"`);
  }
  tokens.push({ type: 'eof', text: '' });
  return tokens;
}

function unescapeChar(c: string): string {
  switch (c) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case '0':
      return '\0';
    case '\\':
      return '\\';
    case "'":
      return "'";
    case '"':
      return '"';
    default:
      return c;
  }
}

export interface EvalContext {
  /** Resolve an identifier (label, .equ/.set constant, .def alias, or PC) to a number. */
  resolveSymbol(name: string): number;
}

const FUNCTIONS: Record<string, (x: number) => number> = {
  LOW: (x) => Math.trunc(x) & 0xff,
  HIGH: (x) => (Math.trunc(x) >> 8) & 0xff,
  BYTE1: (x) => Math.trunc(x) & 0xff,
  BYTE2: (x) => (Math.trunc(x) >> 8) & 0xff,
  BYTE3: (x) => (Math.trunc(x) >> 16) & 0xff,
  BYTE4: (x) => (Math.trunc(x) >> 24) & 0xff,
  INT: (x) => Math.trunc(x),
  EXP2: (x) => 2 ** x,
  LOG2: (x) => Math.log2(x),
};

class Parser {
  private pos = 0;
  private tokens: Token[];
  private ctx: EvalContext;
  constructor(tokens: Token[], ctx: EvalContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType, text?: string) {
    const t = this.advance();
    if (t.type !== type || (text !== undefined && t.text !== text)) {
      throw new ExprError(`Expected ${text ?? type}, got '${t.text}'`);
    }
  }

  parseExpression(): number {
    const v = this.parseOr();
    if (this.peek().type !== 'eof') {
      throw new ExprError(`Unexpected trailing token '${this.peek().text}'`);
    }
    return v;
  }

  private parseOr(): number {
    let v = this.parseAnd();
    while (this.peek().type === 'op' && this.peek().text === '||') {
      this.advance();
      const r = this.parseAnd();
      v = v || r ? 1 : 0;
    }
    return v;
  }

  private parseAnd(): number {
    let v = this.parseBitOr();
    while (this.peek().type === 'op' && this.peek().text === '&&') {
      this.advance();
      const r = this.parseBitOr();
      v = v && r ? 1 : 0;
    }
    return v;
  }

  private parseBitOr(): number {
    let v = this.parseBitXor();
    while (this.peek().type === 'op' && this.peek().text === '|') {
      this.advance();
      v = (Math.trunc(v) | Math.trunc(this.parseBitXor())) >>> 0;
    }
    return v;
  }

  private parseBitXor(): number {
    let v = this.parseBitAnd();
    while (this.peek().type === 'op' && this.peek().text === '^') {
      this.advance();
      v = (Math.trunc(v) ^ Math.trunc(this.parseBitAnd())) >>> 0;
    }
    return v;
  }

  private parseBitAnd(): number {
    let v = this.parseEquality();
    while (this.peek().type === 'op' && this.peek().text === '&') {
      this.advance();
      v = (Math.trunc(v) & Math.trunc(this.parseEquality())) >>> 0;
    }
    return v;
  }

  private parseEquality(): number {
    let v = this.parseRelational();
    while (this.peek().type === 'op' && (this.peek().text === '==' || this.peek().text === '!=')) {
      const op = this.advance().text;
      const r = this.parseRelational();
      v = (op === '==' ? v === r : v !== r) ? 1 : 0;
    }
    return v;
  }

  private parseRelational(): number {
    let v = this.parseShift();
    while (
      this.peek().type === 'op' &&
      ['<', '>', '<=', '>='].includes(this.peek().text)
    ) {
      const op = this.advance().text;
      const r = this.parseShift();
      let result: boolean;
      if (op === '<') result = v < r;
      else if (op === '>') result = v > r;
      else if (op === '<=') result = v <= r;
      else result = v >= r;
      v = result ? 1 : 0;
    }
    return v;
  }

  private parseShift(): number {
    let v = this.parseAdditive();
    while (this.peek().type === 'op' && (this.peek().text === '<<' || this.peek().text === '>>')) {
      const op = this.advance().text;
      const r = Math.trunc(this.parseAdditive());
      v = op === '<<' ? (Math.trunc(v) << r) >>> 0 : Math.trunc(v) >> r;
    }
    return v;
  }

  private parseAdditive(): number {
    let v = this.parseMultiplicative();
    while (this.peek().type === 'op' && (this.peek().text === '+' || this.peek().text === '-')) {
      const op = this.advance().text;
      const r = this.parseMultiplicative();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  private parseMultiplicative(): number {
    let v = this.parseUnary();
    while (this.peek().type === 'op' && ['*', '/', '%'].includes(this.peek().text)) {
      const op = this.advance().text;
      const r = this.parseUnary();
      if (op === '*') v = v * r;
      else if (op === '/') v = v / r;
      else v = Math.trunc(v) % Math.trunc(r);
    }
    return v;
  }

  private parseUnary(): number {
    if (this.peek().type === 'op' && ['-', '+', '~', '!'].includes(this.peek().text)) {
      const op = this.advance().text;
      const v = this.parseUnary();
      if (op === '-') return -v;
      if (op === '+') return v;
      if (op === '~') return ~Math.trunc(v) >>> 0;
      return v ? 0 : 1;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (t.type === 'num') {
      this.advance();
      return t.value!;
    }
    if (t.type === 'char') {
      this.advance();
      return t.value!;
    }
    if (t.type === 'lparen') {
      this.advance();
      const v = this.parseOr();
      this.expect('rparen');
      return v;
    }
    if (t.type === 'ident') {
      this.advance();
      const upper = t.text.toUpperCase();
      if (this.peek().type === 'lparen' && FUNCTIONS[upper]) {
        this.advance();
        const arg = this.parseOr();
        this.expect('rparen');
        return FUNCTIONS[upper](arg);
      }
      if (t.text === 'PC' || t.text === '$') {
        return this.ctx.resolveSymbol('PC');
      }
      return this.ctx.resolveSymbol(t.text);
    }
    throw new ExprError(`Unexpected token '${t.text}' in expression`);
  }
}

export function evaluate(source: string, ctx: EvalContext): number {
  const tokens = tokenize(source);
  return new Parser(tokens, ctx).parseExpression();
}

/** Parses a `.db`-style operand list into individual comma-separated top-level items (parens balanced). */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let inChar = false;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      cur += c;
      if (c === '\\') {
        cur += text[++i] ?? '';
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (inChar) {
      cur += c;
      if (c === '\\') {
        cur += text[++i] ?? '';
      } else if (c === "'") {
        inChar = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      cur += c;
      continue;
    }
    if (c === "'") {
      inChar = true;
      cur += c;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim().length > 0 || parts.length > 0) parts.push(cur.trim());
  return parts;
}

/** Extracts the char codes for a `.db`-style string literal token, e.g. `"ABC"` -> [65,66,67]. */
export function stringLiteralBytes(token: string): number[] | null {
  const t = token.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    const inner = t.slice(1, -1);
    const bytes: number[] = [];
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '\\' && i + 1 < inner.length) {
        bytes.push(unescapeChar(inner[i + 1]).charCodeAt(0));
        i++;
      } else {
        bytes.push(inner.charCodeAt(i));
      }
    }
    return bytes;
  }
  return null;
}
