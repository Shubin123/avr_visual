// C-style preprocessor pass (#define / #ifdef / #ifndef / #if / #elif /
// #else / #endif / #pragma / #undef / #error / #message) plus recursive
// `.include "file"` expansion. Runs before the main two-pass assembler;
// avrasm2/avra source (and m2560def.inc, which uses #ifndef include guards)
// depends on exactly this behavior.
import { evaluate, ExprError, type EvalContext } from './expr';

export class PreprocessError extends Error {
  file: string;
  line: number;
  constructor(message: string, file: string, line: number) {
    super(message);
    this.file = file;
    this.line = line;
  }
}

export interface LogicalLine {
  text: string;
  file: string;
  line: number;
}

interface CondFrame {
  parentActive: boolean;
  taken: boolean;
  /** Whether any branch of this #if/#ifdef/#ifndef ... #elif ... #else chain has fired yet. */
  anyTaken: boolean;
}

export interface ResolveInclude {
  (filename: string): string | null;
}

const MAX_INCLUDE_DEPTH = 16;

function stripLineComment(line: string): string {
  let inStr = false;
  let inChar = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (inChar) {
      if (c === '\\') i++;
      else if (c === "'") inChar = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "'") inChar = true;
    else if (c === ';') return line.slice(0, i);
  }
  return line;
}

/** Replaces whole-word occurrences of `name` with `value`, skipping string/char literals. */
function substituteWord(line: string, name: string, value: string): string {
  let out = '';
  let i = 0;
  const wordRe = /[A-Za-z0-9_]/;
  while (i < line.length) {
    const c = line[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      out += line.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (wordRe.test(c) && !/[0-9]/.test(c)) {
      let j = i;
      while (j < line.length && wordRe.test(line[j])) j++;
      const word = line.slice(i, j);
      if (word === name && !wordRe.test(line[i - 1] ?? '')) {
        out += value;
      } else {
        out += word;
      }
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export class Preprocessor {
  defines = new Map<string, string>();
  /** #message lines collected as they're encountered (informational only). */
  messages: { file: string; line: number; message: string }[] = [];

  private substitute(text: string): string {
    let substituted = text;
    if (this.defines.size > 0 && substituted.trim().length > 0) {
      for (let iter = 0; iter < 8; iter++) {
        let changed = false;
        for (const [name, value] of this.defines) {
          if (value.length === 0) continue; // value-less defines (include guards) aren't substituted
          const next = substituteWord(substituted, name, value);
          if (next !== substituted) {
            substituted = next;
            changed = true;
          }
        }
        if (!changed) break;
      }
    }
    return substituted;
  }

  /** Evaluates a #if/#elif condition against currently-#define'd symbols only. */
  private evalCondition(expr: string, filename: string, lineNo: number): boolean {
    const ctx: EvalContext = {
      resolveSymbol(name) {
        throw new ExprError(`undefined preprocessor symbol '${name}' (only #define'd names are visible to #if/#elif)`);
      },
    };
    try {
      return evaluate(this.substitute(expr), ctx) !== 0;
    } catch (e) {
      throw new PreprocessError(`#if/#elif: ${(e as Error).message}`, filename, lineNo + 1);
    }
  }

  expand(source: string, filename: string, resolveInclude: ResolveInclude, depth = 0): LogicalLine[] {
    if (depth > MAX_INCLUDE_DEPTH) {
      throw new PreprocessError(`.include nesting too deep (possible cycle) in ${filename}`, filename, 0);
    }
    const stack: CondFrame[] = [];
    const isActive = () => (stack.length ? stack[stack.length - 1].taken : true);
    const out: LogicalLine[] = [];
    const rawLines = source.split(/\r\n|\r|\n/);

    for (let lineNo = 0; lineNo < rawLines.length; lineNo++) {
      const raw = stripLineComment(rawLines[lineNo]);
      const trimmed = raw.trim();

      const ifndef = /^#\s*ifndef\s+(\w+)/i.exec(trimmed);
      const ifdef = ifndef ? null : /^#\s*ifdef\s+(\w+)/i.exec(trimmed);
      const ifExpr = ifndef || ifdef ? null : /^#\s*if\s+(.+)$/i.exec(trimmed);
      const elifExpr = /^#\s*elif\s+(.+)$/i.exec(trimmed);
      const elseDir = /^#\s*else\b/i.test(trimmed);
      const endifDir = /^#\s*endif\b/i.test(trimmed);
      const defineDir = /^#\s*define\s+(\w+)\s*(.*)$/i.exec(trimmed);
      const undefDir = /^#\s*undef\s+(\w+)/i.exec(trimmed);
      const pragmaDir = /^#\s*pragma\b/i.test(trimmed);
      const errorDir = /^#\s*error\b\s*(.*)$/i.exec(trimmed);
      const messageDir = /^#\s*message\b\s*(.*)$/i.exec(trimmed);

      if (ifndef || ifdef || ifExpr) {
        const parentActive = isActive();
        const test = ifndef
          ? !this.defines.has(ifndef[1])
          : ifdef
            ? this.defines.has(ifdef[1])
            : parentActive && this.evalCondition(ifExpr![1], filename, lineNo);
        const takenNow = parentActive && test;
        stack.push({ parentActive, taken: takenNow, anyTaken: takenNow });
        continue;
      }
      if (elifExpr) {
        if (!stack.length) throw new PreprocessError('#elif without matching #if/#ifdef/#ifndef', filename, lineNo + 1);
        const frame = stack[stack.length - 1];
        if (!frame.parentActive || frame.anyTaken) {
          frame.taken = false;
        } else {
          const test = this.evalCondition(elifExpr[1], filename, lineNo);
          frame.taken = test;
          if (test) frame.anyTaken = true;
        }
        continue;
      }
      if (elseDir) {
        if (!stack.length) throw new PreprocessError('#else without matching #if/#ifdef/#ifndef', filename, lineNo + 1);
        const frame = stack[stack.length - 1];
        if (!frame.parentActive || frame.anyTaken) {
          frame.taken = false;
        } else {
          frame.taken = true;
          frame.anyTaken = true;
        }
        continue;
      }
      if (endifDir) {
        if (!stack.length) throw new PreprocessError('#endif without matching #if/#ifdef/#ifndef', filename, lineNo + 1);
        stack.pop();
        continue;
      }
      if (!isActive()) continue;

      if (pragmaDir) continue;
      if (errorDir) throw new PreprocessError(errorDir[1].trim() || '#error', filename, lineNo + 1);
      if (messageDir) {
        this.messages.push({ file: filename, line: lineNo + 1, message: messageDir[1].trim() });
        continue;
      }
      if (defineDir) {
        this.defines.set(defineDir[1], defineDir[2].trim());
        continue;
      }
      if (undefDir) {
        this.defines.delete(undefDir[1]);
        continue;
      }

      const includeMatch = /^\.include\s+"([^"]+)"/i.exec(trimmed);
      if (includeMatch) {
        const incName = includeMatch[1];
        const incText = resolveInclude(incName);
        if (incText === null) {
          throw new PreprocessError(
            `Cannot find include file "${incName}" (add it as a project file, or paste its contents inline instead)`,
            filename,
            lineNo + 1,
          );
        }
        out.push(...this.expand(incText, incName, resolveInclude, depth + 1));
        continue;
      }

      const substituted = this.substitute(raw);
      out.push({ text: substituted, file: filename, line: lineNo + 1 });
    }

    if (stack.length) {
      throw new PreprocessError(`Unterminated #ifdef/#ifndef (missing #endif)`, filename, rawLines.length);
    }
    return out;
  }
}
