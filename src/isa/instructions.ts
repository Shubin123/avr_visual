// AVR instruction encoder. Bit patterns are transcribed directly from the
// official "AVR Instruction Set Manual" (Microchip DS40002198), section 6
// ("Instruction Description"), one opcode diagram per instruction/variant.
// This module only encodes already-resolved operand values (registers as
// numbers, immediates/addresses as numbers) — parsing mnemonics/expressions/
// labels is the assembler's job (see assembler.ts).

export class EncodeError extends Error {}

export type Operand =
  | { kind: 'reg'; n: number }
  | { kind: 'imm'; n: number }
  | { kind: 'ptr'; base: 'X' | 'Y' | 'Z'; mode: 'plain' | 'postinc' | 'predec' | 'disp'; disp?: number };

function reg(n: number): Operand {
  return { kind: 'reg', n };
}

/**
 * Packs a 16-bit opcode word from a bit-pattern template (16 chars, MSB
 * first, spaces ignored) and a map of field-letter -> value. When a letter
 * repeats, the leftmost occurrence is the field's most-significant bit,
 * exactly as the manual's diagrams read (e.g. ADIW's "1001 0110 KKdd KKKK").
 */
export function packWord(pattern: string, fields: Record<string, number>): number {
  const clean = pattern.replace(/\s+/g, '');
  if (clean.length !== 16) {
    throw new EncodeError(`Internal error: bad opcode pattern "${pattern}"`);
  }
  const widths: Record<string, number> = {};
  for (const ch of clean) {
    if (ch !== '0' && ch !== '1') widths[ch] = (widths[ch] || 0) + 1;
  }
  const consumed: Record<string, number> = {};
  let word = 0;
  for (let i = 0; i < 16; i++) {
    const ch = clean[i];
    let bit: number;
    if (ch === '0' || ch === '1') {
      bit = ch === '1' ? 1 : 0;
    } else {
      const value = fields[ch];
      if (value === undefined) {
        throw new EncodeError(`Internal error: missing field '${ch}' for pattern "${pattern}"`);
      }
      const occurrence = consumed[ch] || 0;
      const bitPositionInField = widths[ch] - 1 - occurrence;
      bit = (value >>> bitPositionInField) & 1;
      consumed[ch] = occurrence + 1;
    }
    word = (word << 1) | bit;
  }
  return word >>> 0;
}

function assertRange(name: string, value: number, lo: number, hi: number, mnemonic: string) {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new EncodeError(`${mnemonic}: ${name}=${value} out of range [${lo},${hi}]`);
  }
}

function asReg(op: Operand | undefined, mnemonic: string, which: string): number {
  if (!op || op.kind !== 'reg') throw new EncodeError(`${mnemonic}: expected register for ${which}`);
  return op.n;
}

function asImm(op: Operand | undefined, mnemonic: string, which: string): number {
  if (!op || op.kind !== 'imm') throw new EncodeError(`${mnemonic}: expected number for ${which}`);
  return op.n;
}

function need(operands: Operand[], count: number, mnemonic: string) {
  if (operands.length !== count) {
    throw new EncodeError(`${mnemonic}: expected ${count} operand(s), got ${operands.length}`);
  }
}

/** Registers usable in the four ADIW/SBIW register pairs: r24:25, r26:27, r28:29, r30:31. */
function pairIndex(n: number, mnemonic: string): number {
  if (n === 24) return 0;
  if (n === 26) return 1;
  if (n === 28) return 2;
  if (n === 30) return 3;
  throw new EncodeError(`${mnemonic}: register pair must be r24/r26/r28/r30 (got r${n})`);
}

// ---- Generic shape encoders -------------------------------------------------

/** Rd,Rr with both in 0..31. */
function rdRr(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const r = asReg(ops[1], mnemonic, 'Rr');
    assertRange('Rd', d, 0, 31, mnemonic);
    assertRange('Rr', r, 0, 31, mnemonic);
    return [packWord(pattern, { d, r })];
  };
}

/** Rd,Rr with both restricted to 16..31 (4-bit fields storing d-16/r-16). */
function rdRrHigh(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const r = asReg(ops[1], mnemonic, 'Rr');
    assertRange('Rd', d, 16, 31, mnemonic);
    assertRange('Rr', r, 16, 31, mnemonic);
    return [packWord(pattern, { d: d - 16, r: r - 16 })];
  };
}

/** Rd,Rr with both restricted to 16..23 (3-bit fields storing d-16/r-16): FMUL family. */
function rdRrMul(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const r = asReg(ops[1], mnemonic, 'Rr');
    assertRange('Rd', d, 16, 23, mnemonic);
    assertRange('Rr', r, 16, 23, mnemonic);
    return [packWord(pattern, { d: d - 16, r: r - 16 })];
  };
}

/** Rd,K with Rd in 16..31, K in 0..255. */
function rdK(pattern: string, mnemonic: string, complementK = false) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    let K = asImm(ops[1], mnemonic, 'K');
    assertRange('Rd', d, 16, 31, mnemonic);
    assertRange('K', K, 0, 255, mnemonic);
    if (complementK) K = 0xff - K;
    return [packWord(pattern, { d: d - 16, K })];
  };
}

/** Rd only, full range 0..31. */
function rdOnly(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    assertRange('Rd', d, 0, 31, mnemonic);
    return [packWord(pattern, { d })];
  };
}

/** Rd only, restricted to 16..31 (SER). */
function rdOnlyHigh(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    assertRange('Rd', d, 16, 31, mnemonic);
    return [packWord(pattern, { d: d - 16 })];
  };
}

/** Rd,b (register + bit index 0..7): BLD, BST. */
function rdBit(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const b = asImm(ops[1], mnemonic, 'b');
    assertRange('Rd', d, 0, 31, mnemonic);
    assertRange('b', b, 0, 7, mnemonic);
    return [packWord(pattern, { d, b })];
  };
}

/** Rr,b (register + bit index 0..7): SBRC, SBRS. */
function rrBit(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const r = asReg(ops[0], mnemonic, 'Rr');
    const b = asImm(ops[1], mnemonic, 'b');
    assertRange('Rr', r, 0, 31, mnemonic);
    assertRange('b', b, 0, 7, mnemonic);
    return [packWord(pattern, { r, b })];
  };
}

/** A,b (I/O address 0..31 + bit index 0..7): CBI, SBI, SBIC, SBIS. */
function ioBit(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const A = asImm(ops[0], mnemonic, 'A');
    const b = asImm(ops[1], mnemonic, 'b');
    assertRange('A', A, 0, 31, mnemonic);
    assertRange('b', b, 0, 7, mnemonic);
    return [packWord(pattern, { A, b })];
  };
}

/** No operands. */
function noOperand(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 0, mnemonic);
    return [packWord(pattern, {})];
  };
}

/** s (SREG bit index 0..7): BCLR, BSET. */
function sBit(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const s = asImm(ops[0], mnemonic, 's');
    assertRange('s', s, 0, 7, mnemonic);
    return [packWord(pattern, { s })];
  };
}

/** Fixed-s branch/flag mnemonic that just takes the branch offset k (-64..63 words). */
function branchFixedS(pattern: string, s: number, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const k = asImm(ops[0], mnemonic, 'k');
    assertRange('k', k, -64, 63, mnemonic);
    return [packWord(pattern, { k: k & 0x7f, s })];
  };
}

/** BRBC/BRBS: explicit s,k operands. */
function branchGeneric(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const s = asImm(ops[0], mnemonic, 's');
    const k = asImm(ops[1], mnemonic, 'k');
    assertRange('s', s, 0, 7, mnemonic);
    assertRange('k', k, -64, 63, mnemonic);
    return [packWord(pattern, { k: k & 0x7f, s })];
  };
}

/** RJMP/RCALL: k is a signed word offset, -2048..2047. */
function relJump(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const k = asImm(ops[0], mnemonic, 'k');
    assertRange('k', k, -2048, 2047, mnemonic);
    return [packWord(pattern, { k: k & 0xfff })];
  };
}

/** JMP/CALL: k is a 22-bit absolute word address (0..4194303, though the 2560 only has 128K words). */
function absJump(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 1, mnemonic);
    const k = asImm(ops[0], mnemonic, 'k');
    assertRange('k', k, 0, 0x3fffff, mnemonic);
    const hi = (k >>> 16) & 0x3f;
    const word1 = packWord(pattern, { k: hi });
    const word2 = k & 0xffff;
    return [word1, word2];
  };
}

/** IN Rd,A / OUT A,Rr: A is a 6-bit I/O address, 0..63. */
function inOut(pattern: string, mnemonic: string, order: 'reg-io' | 'io-reg') {
  const fieldKey = order === 'reg-io' ? 'd' : 'r';
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const [first, second] = ops;
    const reg = order === 'reg-io' ? asReg(first, mnemonic, 'Rd') : asReg(second, mnemonic, 'Rr');
    const A = order === 'reg-io' ? asImm(second, mnemonic, 'A') : asImm(first, mnemonic, 'A');
    assertRange('Rd/Rr', reg, 0, 31, mnemonic);
    assertRange('A', A, 0, 63, mnemonic);
    return [packWord(pattern, { [fieldKey]: reg, A })];
  };
}

/** ADIW/SBIW: Rd restricted to {24,26,28,30}, K 0..63. */
function adiwSbiw(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const K = asImm(ops[1], mnemonic, 'K');
    const dd = pairIndex(d, mnemonic);
    assertRange('K', K, 0, 63, mnemonic);
    return [packWord(pattern, { d: dd, K })];
  };
}

/** MOVW: Rd,Rr both even, 0..30. */
function movw(): (ops: Operand[]) => number[] {
  const mnemonic = 'MOVW';
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const d = asReg(ops[0], mnemonic, 'Rd');
    const r = asReg(ops[1], mnemonic, 'Rr');
    if (d % 2 !== 0 || d < 0 || d > 30) throw new EncodeError(`${mnemonic}: Rd must be even, 0..30 (got r${d})`);
    if (r % 2 !== 0 || r < 0 || r > 30) throw new EncodeError(`${mnemonic}: Rr must be even, 0..30 (got r${r})`);
    return [packWord('0000 0001 dddd rrrr', { d: d / 2, r: r / 2 })];
  };
}

/** LDS/STS extended (32-bit) direct addressing form. */
function ldsSts(mnemonic: string, direction: 'load' | 'store') {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const regOp = direction === 'load' ? ops[0] : ops[1];
    const addrOp = direction === 'load' ? ops[1] : ops[0];
    const d = asReg(regOp, mnemonic, 'Rd/Rr');
    const k = asImm(addrOp, mnemonic, 'k');
    assertRange('Rd/Rr', d, 0, 31, mnemonic);
    assertRange('k', k, 0, 0xffff, mnemonic);
    const pattern = direction === 'load' ? '1001 000d dddd 0000' : '1001 001d dddd 0000';
    const word1 = packWord(pattern, { d });
    return [word1, k & 0xffff];
  };
}

/** XCH/LAC/LAS/LAT: Z,Rd (Z fixed, no modifiers). */
function zRd(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 2, mnemonic);
    const ptr = ops[0];
    if (ptr.kind !== 'ptr' || ptr.base !== 'Z' || ptr.mode !== 'plain') {
      throw new EncodeError(`${mnemonic}: first operand must be Z`);
    }
    const d = asReg(ops[1], mnemonic, 'Rd');
    assertRange('Rd', d, 0, 31, mnemonic);
    return [packWord(pattern, { r: d })];
  };
}

// ---- LD / ST / LDD / STD / LPM / ELPM ---------------------------------------

function ptrOperand(op: Operand | undefined, mnemonic: string): Extract<Operand, { kind: 'ptr' }> {
  if (!op || op.kind !== 'ptr') throw new EncodeError(`${mnemonic}: expected pointer operand (X/Y/Z)`);
  return op;
}

const LD_PATTERNS: Record<string, { pattern: string; needsQ?: boolean }> = {
  'X,plain': { pattern: '1001 000d dddd 1100' },
  'X,postinc': { pattern: '1001 000d dddd 1101' },
  'X,predec': { pattern: '1001 000d dddd 1110' },
  'Y,plain': { pattern: '1000 000d dddd 1000' },
  'Y,postinc': { pattern: '1001 000d dddd 1001' },
  'Y,predec': { pattern: '1001 000d dddd 1010' },
  'Y,disp': { pattern: '10q0 qq0d dddd 1qqq', needsQ: true },
  'Z,plain': { pattern: '1000 000d dddd 0000' },
  'Z,postinc': { pattern: '1001 000d dddd 0001' },
  'Z,predec': { pattern: '1001 000d dddd 0010' },
  'Z,disp': { pattern: '10q0 qq0d dddd 0qqq', needsQ: true },
};

function ld(ops: Operand[]): number[] {
  const mnemonic = 'LD';
  need(ops, 2, mnemonic);
  const d = asReg(ops[0], mnemonic, 'Rd');
  const ptr = ptrOperand(ops[1], mnemonic);
  assertRange('Rd', d, 0, 31, mnemonic);
  const key = `${ptr.base},${ptr.mode}`;
  const spec = LD_PATTERNS[key];
  if (!spec) throw new EncodeError(`LD: addressing mode ${key} is not valid`);
  const fields: Record<string, number> = { d };
  if (spec.needsQ) {
    const q = ptr.disp ?? 0;
    assertRange('q', q, 0, 63, mnemonic);
    fields.q = q;
  }
  return [packWord(spec.pattern, fields)];
}

const ST_PATTERNS: Record<string, { pattern: string; needsQ?: boolean }> = {
  'X,plain': { pattern: '1001 001r rrrr 1100' },
  'X,postinc': { pattern: '1001 001r rrrr 1101' },
  'X,predec': { pattern: '1001 001r rrrr 1110' },
  'Y,plain': { pattern: '1000 001r rrrr 1000' },
  'Y,postinc': { pattern: '1001 001r rrrr 1001' },
  'Y,predec': { pattern: '1001 001r rrrr 1010' },
  'Y,disp': { pattern: '10q0 qq1r rrrr 1qqq', needsQ: true },
  'Z,plain': { pattern: '1000 001r rrrr 0000' },
  'Z,postinc': { pattern: '1001 001r rrrr 0001' },
  'Z,predec': { pattern: '1001 001r rrrr 0010' },
  'Z,disp': { pattern: '10q0 qq1r rrrr 0qqq', needsQ: true },
};

function st(ops: Operand[]): number[] {
  const mnemonic = 'ST';
  need(ops, 2, mnemonic);
  const ptr = ptrOperand(ops[0], mnemonic);
  const r = asReg(ops[1], mnemonic, 'Rr');
  assertRange('Rr', r, 0, 31, mnemonic);
  const key = `${ptr.base},${ptr.mode}`;
  const spec = ST_PATTERNS[key];
  if (!spec) throw new EncodeError(`ST: addressing mode ${key} is not valid`);
  const fields: Record<string, number> = { r };
  if (spec.needsQ) {
    const q = ptr.disp ?? 0;
    assertRange('q', q, 0, 63, mnemonic);
    fields.q = q;
  }
  return [packWord(spec.pattern, fields)];
}

/** LDD Rd,Y+q / LDD Rd,Z+q — same encoding as LD's displacement forms. */
function ldd(ops: Operand[]): number[] {
  const mnemonic = 'LDD';
  need(ops, 2, mnemonic);
  const d = asReg(ops[0], mnemonic, 'Rd');
  const ptr = ptrOperand(ops[1], mnemonic);
  assertRange('Rd', d, 0, 31, mnemonic);
  if (ptr.mode !== 'disp' || (ptr.base !== 'Y' && ptr.base !== 'Z')) {
    throw new EncodeError('LDD: expected Y+q or Z+q');
  }
  const spec = LD_PATTERNS[`${ptr.base},disp`];
  const q = ptr.disp ?? 0;
  assertRange('q', q, 0, 63, mnemonic);
  return [packWord(spec.pattern, { d, q })];
}

function std(ops: Operand[]): number[] {
  const mnemonic = 'STD';
  need(ops, 2, mnemonic);
  const ptr = ptrOperand(ops[0], mnemonic);
  const r = asReg(ops[1], mnemonic, 'Rr');
  assertRange('Rr', r, 0, 31, mnemonic);
  if (ptr.mode !== 'disp' || (ptr.base !== 'Y' && ptr.base !== 'Z')) {
    throw new EncodeError('STD: expected Y+q or Z+q');
  }
  const spec = ST_PATTERNS[`${ptr.base},disp`];
  const q = ptr.disp ?? 0;
  assertRange('q', q, 0, 63, mnemonic);
  return [packWord(spec.pattern, { r, q })];
}

function lpm(ops: Operand[]): number[] {
  const mnemonic = 'LPM';
  if (ops.length === 0) {
    return [packWord('1001 0101 1100 1000', {})];
  }
  need(ops, 2, mnemonic);
  const d = asReg(ops[0], mnemonic, 'Rd');
  const ptr = ptrOperand(ops[1], mnemonic);
  assertRange('Rd', d, 0, 31, mnemonic);
  if (ptr.base !== 'Z' || (ptr.mode !== 'plain' && ptr.mode !== 'postinc')) {
    throw new EncodeError('LPM: expected Z or Z+');
  }
  const pattern = ptr.mode === 'plain' ? '1001 000d dddd 0100' : '1001 000d dddd 0101';
  return [packWord(pattern, { d })];
}

function elpm(ops: Operand[]): number[] {
  const mnemonic = 'ELPM';
  if (ops.length === 0) {
    return [packWord('1001 0101 1101 1000', {})];
  }
  need(ops, 2, mnemonic);
  const d = asReg(ops[0], mnemonic, 'Rd');
  const ptr = ptrOperand(ops[1], mnemonic);
  assertRange('Rd', d, 0, 31, mnemonic);
  if (ptr.base !== 'Z' || (ptr.mode !== 'plain' && ptr.mode !== 'postinc')) {
    throw new EncodeError('ELPM: expected Z or Z+');
  }
  const pattern = ptr.mode === 'plain' ? '1001 000d dddd 0110' : '1001 000d dddd 0111';
  return [packWord(pattern, { d })];
}

function ijmpIcall(pattern: string, mnemonic: string) {
  return (ops: Operand[]): number[] => {
    need(ops, 0, mnemonic);
    return [packWord(pattern, {})];
  };
}

// ---- The instruction table ---------------------------------------------------

export type Encoder = (ops: Operand[]) => number[];

export const INSTRUCTION_SET: Record<string, Encoder> = {
  ADC: rdRr('0001 11rd dddd rrrr', 'ADC'),
  ADD: rdRr('0000 11rd dddd rrrr', 'ADD'),
  ADIW: adiwSbiw('1001 0110 KKdd KKKK', 'ADIW'),
  AND: rdRr('0010 00rd dddd rrrr', 'AND'),
  ANDI: rdK('0111 KKKK dddd KKKK', 'ANDI'),
  ASR: rdOnly('1001 010d dddd 0101', 'ASR'),
  BCLR: sBit('1001 0100 1sss 1000', 'BCLR'),
  BLD: rdBit('1111 100d dddd 0bbb', 'BLD'),
  BRBC: branchGeneric('1111 01kk kkkk ksss', 'BRBC'),
  BRBS: branchGeneric('1111 00kk kkkk ksss', 'BRBS'),
  BRCC: branchFixedS('1111 01kk kkkk k000', 0, 'BRCC'),
  BRCS: branchFixedS('1111 00kk kkkk k000', 0, 'BRCS'),
  BREAK: noOperand('1001 0101 1001 1000', 'BREAK'),
  BREQ: branchFixedS('1111 00kk kkkk k001', 1, 'BREQ'),
  BRGE: branchFixedS('1111 01kk kkkk k100', 4, 'BRGE'),
  BRHC: branchFixedS('1111 01kk kkkk k101', 5, 'BRHC'),
  BRHS: branchFixedS('1111 00kk kkkk k101', 5, 'BRHS'),
  BRID: branchFixedS('1111 01kk kkkk k111', 7, 'BRID'),
  BRIE: branchFixedS('1111 00kk kkkk k111', 7, 'BRIE'),
  BRLO: branchFixedS('1111 00kk kkkk k000', 0, 'BRLO'),
  BRLT: branchFixedS('1111 00kk kkkk k100', 4, 'BRLT'),
  BRMI: branchFixedS('1111 00kk kkkk k010', 2, 'BRMI'),
  BRNE: branchFixedS('1111 01kk kkkk k001', 1, 'BRNE'),
  BRPL: branchFixedS('1111 01kk kkkk k010', 2, 'BRPL'),
  BRSH: branchFixedS('1111 01kk kkkk k000', 0, 'BRSH'),
  BRTC: branchFixedS('1111 01kk kkkk k110', 6, 'BRTC'),
  BRTS: branchFixedS('1111 00kk kkkk k110', 6, 'BRTS'),
  BRVC: branchFixedS('1111 01kk kkkk k011', 3, 'BRVC'),
  BRVS: branchFixedS('1111 00kk kkkk k011', 3, 'BRVS'),
  BSET: sBit('1001 0100 0sss 1000', 'BSET'),
  BST: rdBit('1111 101d dddd 0bbb', 'BST'),
  CALL: absJump('1001 010k kkkk 111k', 'CALL'),
  CBI: ioBit('1001 1000 AAAA Abbb', 'CBI'),
  CBR: rdK('0111 KKKK dddd KKKK', 'CBR', true),
  CLR: rdRr('0010 01rd dddd rrrr', 'CLR'), // assembler passes Rd twice
  COM: rdOnly('1001 010d dddd 0000', 'COM'),
  CP: rdRr('0001 01rd dddd rrrr', 'CP'),
  CPC: rdRr('0000 01rd dddd rrrr', 'CPC'),
  CPI: rdK('0011 KKKK dddd KKKK', 'CPI'),
  CPSE: rdRr('0001 00rd dddd rrrr', 'CPSE'),
  DEC: rdOnly('1001 010d dddd 1010', 'DEC'),
  EICALL: ijmpIcall('1001 0101 0001 1001', 'EICALL'),
  EIJMP: ijmpIcall('1001 0100 0001 1001', 'EIJMP'),
  ELPM: elpm as unknown as Encoder,
  EOR: rdRr('0010 01rd dddd rrrr', 'EOR'),
  FMUL: rdRrMul('0000 0011 0ddd 1rrr', 'FMUL'),
  FMULS: rdRrMul('0000 0011 1ddd 0rrr', 'FMULS'),
  FMULSU: rdRrMul('0000 0011 1ddd 1rrr', 'FMULSU'),
  ICALL: ijmpIcall('1001 0101 0000 1001', 'ICALL'),
  IJMP: ijmpIcall('1001 0100 0000 1001', 'IJMP'),
  IN: inOut('1011 0AAd dddd AAAA', 'IN', 'reg-io'),
  INC: rdOnly('1001 010d dddd 0011', 'INC'),
  JMP: absJump('1001 010k kkkk 110k', 'JMP'),
  LAC: zRd('1001 001r rrrr 0110', 'LAC'),
  LAS: zRd('1001 001r rrrr 0101', 'LAS'),
  LAT: zRd('1001 001r rrrr 0111', 'LAT'),
  LD: ld,
  LDD: ldd,
  LDI: rdK('1110 KKKK dddd KKKK', 'LDI'),
  LDS: ldsSts('LDS', 'load'),
  LPM: lpm as unknown as Encoder,
  LSL: rdRr('0000 11dd dddd dddd', 'LSL'), // assembler passes Rd twice
  LSR: rdOnly('1001 010d dddd 0110', 'LSR'),
  MOV: rdRr('0010 11rd dddd rrrr', 'MOV'),
  MOVW: movw(),
  MUL: rdRr('1001 11rd dddd rrrr', 'MUL'),
  MULS: rdRrHigh('0000 0010 dddd rrrr', 'MULS'),
  MULSU: rdRrMul('0000 0011 0ddd 0rrr', 'MULSU'),
  NEG: rdOnly('1001 010d dddd 0001', 'NEG'),
  NOP: noOperand('0000 0000 0000 0000', 'NOP'),
  OR: rdRr('0010 10rd dddd rrrr', 'OR'),
  ORI: rdK('0110 KKKK dddd KKKK', 'ORI'),
  OUT: inOut('1011 1AAr rrrr AAAA', 'OUT', 'io-reg'),
  POP: rdOnly('1001 000d dddd 1111', 'POP'),
  PUSH: rdOnly('1001 001d dddd 1111', 'PUSH'),
  RCALL: relJump('1101 kkkk kkkk kkkk', 'RCALL'),
  RET: noOperand('1001 0101 0000 1000', 'RET'),
  RETI: noOperand('1001 0101 0001 1000', 'RETI'),
  RJMP: relJump('1100 kkkk kkkk kkkk', 'RJMP'),
  ROL: rdRr('0001 11dd dddd dddd', 'ROL'), // assembler passes Rd twice
  ROR: rdOnly('1001 010d dddd 0111', 'ROR'),
  SBC: rdRr('0000 10rd dddd rrrr', 'SBC'),
  SBCI: rdK('0100 KKKK dddd KKKK', 'SBCI'),
  SBI: ioBit('1001 1010 AAAA Abbb', 'SBI'),
  SBIC: ioBit('1001 1001 AAAA Abbb', 'SBIC'),
  SBIS: ioBit('1001 1011 AAAA Abbb', 'SBIS'),
  SBIW: adiwSbiw('1001 0111 KKdd KKKK', 'SBIW'),
  SBR: rdK('0110 KKKK dddd KKKK', 'SBR'),
  SBRC: rrBit('1111 110r rrrr 0bbb', 'SBRC'),
  SBRS: rrBit('1111 111r rrrr 0bbb', 'SBRS'),
  SER: rdOnlyHigh('1110 1111 dddd 1111', 'SER'),
  SLEEP: noOperand('1001 0101 1000 1000', 'SLEEP'),
  ST: st,
  STD: std,
  STS: ldsSts('STS', 'store'),
  SUB: rdRr('0001 10rd dddd rrrr', 'SUB'),
  SUBI: rdK('0101 KKKK dddd KKKK', 'SUBI'),
  SWAP: rdOnly('1001 010d dddd 0010', 'SWAP'),
  TST: rdRr('0010 00dd dddd dddd', 'TST'), // assembler passes Rd twice
  WDR: noOperand('1001 0101 1010 1000', 'WDR'),
  XCH: zRd('1001 001r rrrr 0100', 'XCH'),
};

/** SREG single-flag set/clear convenience mnemonics; all encode as BSET/BCLR with a fixed s. */
export const FLAG_MNEMONICS: Record<string, { set: boolean; s: number }> = {
  SEC: { set: true, s: 0 },
  CLC: { set: false, s: 0 },
  SEZ: { set: true, s: 1 },
  CLZ: { set: false, s: 1 },
  SEN: { set: true, s: 2 },
  CLN: { set: false, s: 2 },
  SEV: { set: true, s: 3 },
  CLV: { set: false, s: 3 },
  SES: { set: true, s: 4 },
  CLS: { set: false, s: 4 },
  SEH: { set: true, s: 5 },
  CLH: { set: false, s: 5 },
  SET: { set: true, s: 6 },
  CLT: { set: false, s: 6 },
  SEI: { set: true, s: 7 },
  CLI: { set: false, s: 7 },
};

/** Mnemonics that are pure aliases taking Rd only, expanded to Rd,Rd before encoding: CLR/LSL/ROL/TST. */
export const SELF_PAIR_MNEMONICS = new Set(['CLR', 'LSL', 'ROL', 'TST']);

export { reg };
