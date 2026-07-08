// Two-pass AVR assembler: preprocess (#define/#ifdef/.include) -> expand
// .macro invocations -> Pass 1 (build the symbol table: label/equ/def values,
// resolving .if/.else/.endif and segment counters as it goes) -> Pass 2
// (parse operands, evaluate expressions now that every label is known, and
// encode instructions/data into the flash image).
import { Preprocessor, type LogicalLine } from './preprocess';
import { resolveBundledInclude } from '../mega2560/includes';
import { evaluate, ExprError, splitTopLevel, stringLiteralBytes, type EvalContext } from './expr';
import { INSTRUCTION_SET, FLAG_MNEMONICS, EncodeError, type Operand } from './instructions';
import { SRAM_START, FLASHEND_WORDS } from '../mega2560/device';

export interface AsmDiagnostic {
  file: string;
  line: number;
  message: string;
}

export interface SourceMapEntry {
  file: string;
  line: number;
}

export interface AssembleResult {
  success: boolean;
  program: Uint16Array;
  sourceMap: Map<number, SourceMapEntry>;
  labels: Map<string, { value: number; segment: Segment }>;
  errors: AsmDiagnostic[];
  warnings: AsmDiagnostic[];
}

type Segment = 'CSEG' | 'DSEG' | 'ESEG';

interface SymbolEntry {
  kind: 'equ' | 'label' | 'def';
  value: number;
  segment?: Segment;
  /** Original as-written casing, for display (symbol lookups are case-insensitive). */
  displayName?: string;
}

class AsmError extends Error {}

const WORDS_FOR_MNEMONIC: Record<string, 1 | 2> = { JMP: 2, CALL: 2, LDS: 2, STS: 2 };
function wordsFor(mnemonic: string): 1 | 2 {
  return WORDS_FOR_MNEMONIC[mnemonic] ?? 1;
}

// ---- Mnemonic -> operand-parsing shape ------------------------------------

type Shape =
  | 'rdRr' | 'rdRrHigh' | 'rdRrMul' | 'rdK' | 'rdOnly' | 'rdOnlyHigh'
  | 'rdBit' | 'rrBit' | 'ioBit' | 'noOperand' | 'sBit'
  | 'branchGeneric' | 'branchFixedS' | 'relJump' | 'absJump'
  | 'inOutIn' | 'inOutOut' | 'adiwSbiw' | 'movw'
  | 'ldsLoad' | 'stsStore' | 'zRd' | 'ld' | 'ldd' | 'st' | 'std' | 'lpm' | 'elpm'
  | 'selfPair';

const SHAPES: Record<Shape, string[]> = {
  rdRr: ['ADC', 'ADD', 'AND', 'CP', 'CPC', 'CPSE', 'EOR', 'MOV', 'MUL', 'OR', 'SBC', 'SUB'],
  rdRrHigh: ['MULS'],
  rdRrMul: ['FMUL', 'FMULS', 'FMULSU', 'MULSU'],
  rdK: ['ANDI', 'CPI', 'LDI', 'ORI', 'SBCI', 'SBR', 'SUBI', 'CBR'],
  rdOnly: ['ASR', 'COM', 'DEC', 'INC', 'LSR', 'NEG', 'POP', 'PUSH', 'ROR', 'SWAP'],
  rdOnlyHigh: ['SER'],
  rdBit: ['BLD', 'BST'],
  rrBit: ['SBRC', 'SBRS'],
  ioBit: ['CBI', 'SBI', 'SBIC', 'SBIS'],
  noOperand: ['BREAK', 'NOP', 'RET', 'RETI', 'SLEEP', 'WDR', 'IJMP', 'ICALL', 'EIJMP', 'EICALL'],
  sBit: ['BCLR', 'BSET'],
  branchGeneric: ['BRBC', 'BRBS'],
  branchFixedS: [
    'BRCC', 'BRCS', 'BREQ', 'BRGE', 'BRHC', 'BRHS', 'BRID', 'BRIE', 'BRLO', 'BRLT',
    'BRMI', 'BRNE', 'BRPL', 'BRSH', 'BRTC', 'BRTS', 'BRVC', 'BRVS',
  ],
  relJump: ['RJMP', 'RCALL'],
  absJump: ['JMP', 'CALL'],
  inOutIn: ['IN'],
  inOutOut: ['OUT'],
  adiwSbiw: ['ADIW', 'SBIW'],
  movw: ['MOVW'],
  ldsLoad: ['LDS'],
  stsStore: ['STS'],
  zRd: ['XCH', 'LAC', 'LAS', 'LAT'],
  ld: ['LD'],
  ldd: ['LDD'],
  st: ['ST'],
  std: ['STD'],
  lpm: ['LPM'],
  elpm: ['ELPM'],
  selfPair: ['CLR', 'LSL', 'ROL', 'TST'],
};

const MNEMONIC_SHAPE = new Map<string, Shape>();
for (const [shape, mnemonics] of Object.entries(SHAPES)) {
  for (const m of mnemonics) MNEMONIC_SHAPE.set(m, shape as Shape);
}

function isKnownMnemonic(upper: string): boolean {
  return Boolean(FLAG_MNEMONICS[upper]) || MNEMONIC_SHAPE.has(upper);
}

function wrapSigned(value: number, bits: number): number {
  if (value >= 0) return value;
  const mod = 2 ** bits;
  return ((value % mod) + mod) % mod;
}

export function assemble(sourceText: string, mainFileName = 'main.asm'): AssembleResult {
  const errors: AsmDiagnostic[] = [];
  const warnings: AsmDiagnostic[] = [];

  let lines: LogicalLine[];
  try {
    const pre = new Preprocessor();
    // Microchip Studio implicitly includes the target device's header even
    // without an explicit `.include` line (course skeletons rely on this —
    // see multi_timer.asm's comment to that effect). The file's own
    // `#ifndef _M2560DEF_INC_` guard makes an explicit user `.include` later
    // in the same file a harmless no-op.
    const prelude = pre.expand('.include "m2560def.inc"', mainFileName, resolveBundledInclude);
    const body = pre.expand(sourceText, mainFileName, resolveBundledInclude);
    lines = [...prelude, ...body];
  } catch (e) {
    const err = e as { message: string; file?: string; line?: number };
    errors.push({ file: err.file ?? mainFileName, line: err.line ?? 0, message: err.message });
    return { success: false, program: new Uint16Array(0), sourceMap: new Map(), labels: new Map(), errors, warnings };
  }

  try {
    lines = expandMacros(lines);
  } catch (e) {
    errors.push({ file: mainFileName, line: 0, message: (e as Error).message });
    return { success: false, program: new Uint16Array(0), sourceMap: new Map(), labels: new Map(), errors, warnings };
  }

  const symbols = new Map<string, SymbolEntry>();

  // ---- Pass 1: resolve every label/equ/def and segment address -------------
  {
    let cseg = 0;
    let dseg = SRAM_START;
    let eseg = 0;
    let segment: Segment = 'CSEG';
    const condStack: { parentActive: boolean; taken: boolean }[] = [];
    const isActive = () => (condStack.length ? condStack[condStack.length - 1].taken : true);
    const currentCounter = () => (segment === 'CSEG' ? cseg : segment === 'DSEG' ? dseg : eseg);
    const ctx: EvalContext = {
      resolveSymbol(name) {
        if (name.toUpperCase() === 'PC') return currentCounter();
        const entry = symbols.get(name.toUpperCase());
        if (!entry) throw new ExprError(`undefined symbol '${name}'`);
        return entry.value;
      },
    };
    const evalExpr = (s: string) => evaluate(s, ctx);

    for (let i = 0; i < lines.length; i++) {
      const { text, file, line } = lines[i];
      try {
        const { label, rest } = splitLabel(text);
        const trimmed = rest.trim();
        const dotMatch = /^\.(\w+)\s*(.*)$/.exec(trimmed);
        const directive = dotMatch ? dotMatch[1].toLowerCase() : null;

        // .if/.else/.endif control whether we register anything for this line at all.
        if (directive === 'if') {
          const parentActive = isActive();
          const cond = parentActive ? evalExpr(dotMatch![2]) !== 0 : false;
          condStack.push({ parentActive, taken: parentActive && cond });
          continue;
        }
        if (directive === 'else') {
          if (!condStack.length) throw new AsmError('.else without .if');
          const frame = condStack[condStack.length - 1];
          frame.taken = frame.parentActive && !frame.taken;
          continue;
        }
        if (directive === 'endif') {
          if (!condStack.length) throw new AsmError('.endif without .if');
          condStack.pop();
          continue;
        }
        if (!isActive()) continue;

        if (label) {
          if (symbols.has(label.toUpperCase())) throw new AsmError(`symbol '${label}' redefined`);
          symbols.set(label.toUpperCase(), {
            kind: 'label',
            value: currentCounter(),
            segment,
            displayName: label,
          });
        }
        if (trimmed.length === 0) continue;

        if (directive) {
          const args = dotMatch![2];
          switch (directive) {
            case 'error':
              throw new AsmError(unquote(args.trim()));
            case 'warning':
              warnings.push({ file, line, message: args.trim() });
              continue;
            case 'cseg':
              segment = 'CSEG';
              continue;
            case 'dseg':
              segment = 'DSEG';
              continue;
            case 'eseg':
              segment = 'ESEG';
              continue;
            case 'org': {
              const target = Math.trunc(evalExpr(args.trim()));
              if (segment === 'CSEG') cseg = target;
              else if (segment === 'DSEG') dseg = target;
              else eseg = target;
              continue;
            }
            case 'equ':
            case 'set': {
              const m = /^(\w+)\s*=\s*(.+)$/.exec(args.trim());
              if (!m) throw new AsmError(`malformed .${directive} (expected NAME = expr)`);
              symbols.set(m[1].toUpperCase(), { kind: 'equ', value: evalExpr(m[2]) });
              continue;
            }
            case 'def': {
              const m = /^(\w+)\s*=\s*[rR](\d+)$/.exec(args.trim());
              if (!m) throw new AsmError('malformed .def (expected NAME = Rn)');
              symbols.set(m[1].toUpperCase(), { kind: 'def', value: parseInt(m[2], 10) });
              continue;
            }
            case 'undef':
              symbols.delete(args.trim().toUpperCase());
              continue;
            case 'byte': {
              if (segment !== 'DSEG') warnings.push({ file, line, message: '.byte used outside .dseg' });
              dseg += Math.trunc(evalExpr(args.trim()));
              continue;
            }
            case 'db': {
              // Each .db statement is padded independently: 2 bytes/word, a
              // trailing zero byte if the statement's own count is odd.
              const byteCount = countDbBytes(args);
              if (segment === 'CSEG') cseg += Math.ceil(byteCount / 2);
              else if (segment === 'ESEG') eseg += byteCount;
              continue;
            }
            case 'dw': {
              const items = splitTopLevel(args).filter((s) => s.length > 0);
              if (segment === 'CSEG') cseg += items.length;
              else if (segment === 'ESEG') eseg += items.length * 2;
              continue;
            }
            case 'device':
            case 'list':
            case 'nolist':
            case 'listmac':
            case 'exit':
            case 'macro':
            case 'endmacro':
            case 'endm':
              continue;
            default:
              warnings.push({ file, line, message: `unknown directive .${directive} ignored` });
              continue;
          }
        }

        const { mnemonic } = splitMnemonic(trimmed);
        const upper = mnemonic.toUpperCase();
        if (!isKnownMnemonic(upper)) throw new AsmError(`unknown instruction '${mnemonic}'`);
        if (segment === 'CSEG') cseg += wordsFor(upper);
      } catch (e) {
        errors.push({ file, line, message: (e as Error).message });
      }
    }
    if (condStack.length) {
      errors.push({ file: mainFileName, line: lines.length, message: 'unterminated .if (missing .endif)' });
    }
  }

  // ---- Pass 2: encode using the now-complete symbol table -------------------
  const program = new Uint16Array(FLASHEND_WORDS + 1);
  const sourceMap = new Map<number, SourceMapEntry>();
  {
    let cseg = 0;
    let dseg = SRAM_START;
    let eseg = 0;
    let segment: Segment = 'CSEG';
    const condStack: { parentActive: boolean; taken: boolean }[] = [];
    const isActive = () => (condStack.length ? condStack[condStack.length - 1].taken : true);
    const currentCounter = () => (segment === 'CSEG' ? cseg : segment === 'DSEG' ? dseg : eseg);
    const ctx: EvalContext = {
      resolveSymbol(name) {
        if (name.toUpperCase() === 'PC') return currentCounter();
        const entry = symbols.get(name.toUpperCase());
        if (!entry) throw new ExprError(`undefined symbol '${name}'`);
        return entry.value;
      },
    };
    const evalExpr = (s: string) => evaluate(s, ctx);
    const emitWord = (addr: number, word: number, file: string, line: number) => {
      if (addr >= 0 && addr < program.length) {
        program[addr] = word & 0xffff;
        sourceMap.set(addr, { file, line });
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const { text, file, line } = lines[i];
      const { rest } = splitLabel(text);
      const trimmed = rest.trim();
      const dotMatch = /^\.(\w+)\s*(.*)$/.exec(trimmed);
      const directive = dotMatch ? dotMatch[1].toLowerCase() : null;

      try {
        if (directive === 'if') {
          const parentActive = isActive();
          const cond = parentActive ? evalExpr(dotMatch![2]) !== 0 : false;
          condStack.push({ parentActive, taken: parentActive && cond });
          continue;
        }
        if (directive === 'else') {
          if (condStack.length) {
            const frame = condStack[condStack.length - 1];
            frame.taken = frame.parentActive && !frame.taken;
          }
          continue;
        }
        if (directive === 'endif') {
          condStack.pop();
          continue;
        }
        if (!isActive()) continue;
        if (trimmed.length === 0) continue;

        if (directive) {
          const args = dotMatch![2];
          switch (directive) {
            case 'cseg':
              segment = 'CSEG';
              continue;
            case 'dseg':
              segment = 'DSEG';
              continue;
            case 'eseg':
              segment = 'ESEG';
              continue;
            case 'org': {
              const target = Math.trunc(evalExpr(args.trim()));
              if (segment === 'CSEG') cseg = target;
              else if (segment === 'DSEG') dseg = target;
              else eseg = target;
              continue;
            }
            case 'byte':
              dseg += Math.trunc(evalExpr(args.trim()));
              continue;
            case 'db': {
              const bytes = evalDbBytes(args, evalExpr);
              if (segment === 'CSEG') {
                for (let bi = 0; bi < bytes.length; bi += 2) {
                  const lo = bytes[bi];
                  const hi = bi + 1 < bytes.length ? bytes[bi + 1] : 0;
                  emitWord(cseg++, lo | (hi << 8), file, line);
                }
              } else if (segment === 'ESEG') {
                eseg += bytes.length;
              }
              continue;
            }
            case 'dw': {
              const items = splitTopLevel(args).filter((s) => s.length > 0);
              for (const it of items) {
                const v = Math.trunc(evalExpr(it));
                if (segment === 'CSEG') {
                  emitWord(cseg++, v, file, line);
                } else if (segment === 'ESEG') {
                  eseg += 2;
                }
              }
              continue;
            }
            default:
              continue; // equ/set/def/undef/device/list/... already fully handled in pass 1
          }
        }

        const { mnemonic, operandsText } = splitMnemonic(trimmed);
        const upper = mnemonic.toUpperCase();
        if (!isKnownMnemonic(upper)) continue; // already reported in pass 1

        const instrAddr = cseg;
        const words = encodeLine(upper, operandsText, instrAddr, evalExpr, symbols);
        for (let w = 0; w < words.length; w++) {
          emitWord(instrAddr + w, words[w], file, line);
        }
        cseg += words.length;
      } catch (e) {
        errors.push({ file, line, message: (e as Error).message });
        if (directive === null) {
          const { mnemonic } = splitMnemonic(trimmed);
          const upper = mnemonic.toUpperCase();
          if (isKnownMnemonic(upper)) cseg += wordsFor(upper);
        }
      }
    }
  }

  const labels = new Map<string, { value: number; segment: Segment }>();
  for (const entry of symbols.values()) {
    if (entry.kind === 'label') {
      labels.set(entry.displayName ?? '?', { value: entry.value, segment: entry.segment! });
    }
  }

  return { success: errors.length === 0, program, sourceMap, labels, errors, warnings };
}

// ---- Helpers ----------------------------------------------------------------

function unquote(s: string): string {
  const bytes = stringLiteralBytes(s);
  return bytes ? String.fromCharCode(...bytes) : s;
}

function splitLabel(text: string): { label: string | null; rest: string } {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(text);
  if (m) return { label: m[1], rest: m[2] };
  return { label: null, rest: text };
}

function splitMnemonic(text: string): { mnemonic: string; operandsText: string } {
  const m = /^(\S+)\s*(.*)$/.exec(text.trim());
  if (!m) return { mnemonic: '', operandsText: '' };
  return { mnemonic: m[1], operandsText: m[2] };
}

function countDbBytes(args: string): number {
  const items = splitTopLevel(args).filter((s) => s.length > 0);
  let count = 0;
  for (const item of items) {
    const strBytes = stringLiteralBytes(item);
    count += strBytes ? strBytes.length : 1;
  }
  return count;
}

function evalDbBytes(args: string, evalExpr: (s: string) => number): number[] {
  const items = splitTopLevel(args).filter((s) => s.length > 0);
  const bytes: number[] = [];
  for (const item of items) {
    const strBytes = stringLiteralBytes(item);
    if (strBytes) bytes.push(...strBytes);
    else bytes.push(Math.trunc(evalExpr(item)) & 0xff);
  }
  return bytes;
}

function expandMacros(lines: LogicalLine[]): LogicalLine[] {
  const macros = new Map<string, LogicalLine[]>();
  const out: LogicalLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const { text } = lines[i];
    const m = /^\s*\.macro\s+(\S+)/i.exec(text);
    if (m) {
      const name = m[1].toUpperCase();
      const body: LogicalLine[] = [];
      i++;
      while (i < lines.length && !/^\s*\.endm(acro)?\b/i.test(lines[i].text)) {
        body.push(lines[i]);
        i++;
      }
      i++;
      macros.set(name, body);
      continue;
    }
    const { label, rest } = splitLabel(text);
    const inv = /^\s*(\S+)\s*(.*)$/.exec(rest);
    if (!label && inv && macros.has(inv[1].toUpperCase())) {
      const body = macros.get(inv[1].toUpperCase())!;
      const args = splitTopLevel(inv[2]).map((s) => s.trim());
      for (const bodyLine of body) {
        let t = bodyLine.text;
        for (let a = 0; a < args.length; a++) {
          t = t.split(`@${a}`).join(args[a]);
        }
        out.push({ text: t, file: lines[i].file, line: lines[i].line });
      }
      i++;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out;
}

const REG_RE = /^[rR](\d{1,2})$/;

/** Bare X/Y/Z (no +/-/displacement) used as a plain register operand, e.g. `adiw Z,1`. */
const BARE_POINTER_REG: Record<string, number> = { X: 26, Y: 28, Z: 30 };

function resolveRegister(token: string, symbols: Map<string, SymbolEntry>): number | null {
  const entry = symbols.get(token.toUpperCase());
  if (entry && entry.kind === 'def') return entry.value;
  const bare = BARE_POINTER_REG[token.toUpperCase()];
  if (bare !== undefined) return bare;
  const m = REG_RE.exec(token);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n <= 31) return n;
  }
  return null;
}

function parsePointer(token: string, evalExpr: (s: string) => number): Extract<Operand, { kind: 'ptr' }> | null {
  const t = token.trim();
  let m = /^-([XYZxyz])$/.exec(t);
  if (m) return { kind: 'ptr', base: m[1].toUpperCase() as 'X' | 'Y' | 'Z', mode: 'predec' };
  m = /^([XYZxyz])\+$/.exec(t);
  if (m) return { kind: 'ptr', base: m[1].toUpperCase() as 'X' | 'Y' | 'Z', mode: 'postinc' };
  m = /^([XYZxyz])$/.exec(t);
  if (m) return { kind: 'ptr', base: m[1].toUpperCase() as 'X' | 'Y' | 'Z', mode: 'plain' };
  m = /^([XYZxyz])\s*\+\s*(.+)$/.exec(t);
  if (m) {
    const disp = Math.trunc(evalExpr(m[2]));
    return { kind: 'ptr', base: m[1].toUpperCase() as 'X' | 'Y' | 'Z', mode: 'disp', disp };
  }
  return null;
}

function encodeLine(
  upper: string,
  operandsText: string,
  instrAddr: number,
  evalExpr: (s: string) => number,
  symbols: Map<string, SymbolEntry>,
): number[] {
  const rawOperands = splitTopLevel(operandsText).filter((s) => s.length > 0);

  if (FLAG_MNEMONICS[upper]) {
    const { set, s } = FLAG_MNEMONICS[upper];
    return INSTRUCTION_SET[set ? 'BSET' : 'BCLR']([{ kind: 'imm', n: s }]);
  }

  const shape = MNEMONIC_SHAPE.get(upper)!;

  const reg = (raw: string): Operand => {
    const n = resolveRegister(raw.trim(), symbols);
    if (n === null) throw new AsmError(`expected a register, got '${raw}'`);
    return { kind: 'reg', n };
  };
  const imm = (raw: string, width?: number): Operand => {
    let v = Math.trunc(evalExpr(raw.trim()));
    if (width !== undefined) v = wrapSigned(v, width);
    return { kind: 'imm', n: v };
  };
  const ptr = (raw: string): Operand => {
    const p = parsePointer(raw.trim(), evalExpr);
    if (!p) throw new AsmError(`expected X/Y/Z addressing, got '${raw}'`);
    return p;
  };
  const relative = (raw: string, _width: number): Operand => {
    const target = Math.trunc(evalExpr(raw.trim()));
    const k = target - (instrAddr + 1);
    return { kind: 'imm', n: k };
  };

  switch (shape) {
    case 'rdRr':
    case 'rdRrHigh':
    case 'rdRrMul':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0]), reg(rawOperands[1])]);
    case 'rdK': {
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0]), imm(rawOperands[1], 8)]);
    }
    case 'rdOnly':
    case 'rdOnlyHigh':
      requireCount(rawOperands, 1, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0])]);
    case 'rdBit':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0]), imm(rawOperands[1], 3)]);
    case 'rrBit':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0]), imm(rawOperands[1], 3)]);
    case 'ioBit':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([imm(rawOperands[0], 5), imm(rawOperands[1], 3)]);
    case 'noOperand':
      requireCount(rawOperands, 0, upper);
      return INSTRUCTION_SET[upper]([]);
    case 'sBit':
      requireCount(rawOperands, 1, upper);
      return INSTRUCTION_SET[upper]([imm(rawOperands[0], 3)]);
    case 'branchGeneric':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([imm(rawOperands[0], 3), relative(rawOperands[1], 7)]);
    case 'branchFixedS':
      requireCount(rawOperands, 1, upper);
      return INSTRUCTION_SET[upper]([relative(rawOperands[0], 7)]);
    case 'relJump':
      requireCount(rawOperands, 1, upper);
      return INSTRUCTION_SET[upper]([relative(rawOperands[0], 12)]);
    case 'absJump':
      requireCount(rawOperands, 1, upper);
      return INSTRUCTION_SET[upper]([imm(rawOperands[0], 22)]);
    case 'inOutIn':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.IN([reg(rawOperands[0]), imm(rawOperands[1], 6)]);
    case 'inOutOut':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.OUT([imm(rawOperands[0], 6), reg(rawOperands[1])]);
    case 'adiwSbiw':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([reg(rawOperands[0]), imm(rawOperands[1], 6)]);
    case 'movw':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.MOVW([reg(rawOperands[0]), reg(rawOperands[1])]);
    case 'ldsLoad':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.LDS([reg(rawOperands[0]), imm(rawOperands[1], 16)]);
    case 'stsStore':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.STS([imm(rawOperands[0], 16), reg(rawOperands[1])]);
    case 'zRd':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET[upper]([ptr(rawOperands[0]), reg(rawOperands[1])]);
    case 'ld':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.LD([reg(rawOperands[0]), ptr(rawOperands[1])]);
    case 'ldd':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.LDD([reg(rawOperands[0]), ptr(rawOperands[1])]);
    case 'st':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.ST([ptr(rawOperands[0]), reg(rawOperands[1])]);
    case 'std':
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.STD([ptr(rawOperands[0]), reg(rawOperands[1])]);
    case 'lpm':
      if (rawOperands.length === 0) return INSTRUCTION_SET.LPM([]);
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.LPM([reg(rawOperands[0]), ptr(rawOperands[1])]);
    case 'elpm':
      if (rawOperands.length === 0) return INSTRUCTION_SET.ELPM([]);
      requireCount(rawOperands, 2, upper);
      return INSTRUCTION_SET.ELPM([reg(rawOperands[0]), ptr(rawOperands[1])]);
    case 'selfPair': {
      requireCount(rawOperands, 1, upper);
      const r = reg(rawOperands[0]);
      const realMnemonic = { CLR: 'EOR', LSL: 'ADD', ROL: 'ADC', TST: 'AND' }[upper]!;
      return INSTRUCTION_SET[realMnemonic]([r, r]);
    }
    default:
      throw new AsmError(`internal: no parser for shape ${shape}`);
  }
}

function requireCount(ops: string[], count: number, mnemonic: string) {
  if (ops.length !== count) {
    throw new AsmError(`${mnemonic}: expected ${count} operand(s), got ${ops.length}`);
  }
}

export { EncodeError, AsmError };
