import { describe, expect, it } from 'vitest';
import { INSTRUCTION_SET, type Operand } from './instructions';

const R = (n: number): Operand => ({ kind: 'reg', n });
const I = (n: number): Operand => ({ kind: 'imm', n });
const PTR = (
  base: 'X' | 'Y' | 'Z',
  mode: 'plain' | 'postinc' | 'predec' | 'disp',
  disp?: number,
): Operand => ({ kind: 'ptr', base, mode, disp });

function enc(mnemonic: string, ops: Operand[]): number[] {
  return INSTRUCTION_SET[mnemonic](ops);
}

describe('instruction encoder — opcodes verified by hand against the AVR ISA manual', () => {
  it('encodes fixed no-operand instructions', () => {
    expect(enc('NOP', [])).toEqual([0x0000]);
    expect(enc('RET', [])).toEqual([0x9508]);
    expect(enc('RETI', [])).toEqual([0x9518]);
    expect(enc('SLEEP', [])).toEqual([0x9588]);
    expect(enc('WDR', [])).toEqual([0x95a8]);
    expect(enc('IJMP', [])).toEqual([0x9409]);
    expect(enc('ICALL', [])).toEqual([0x9509]);
  });

  it('encodes LDI', () => {
    expect(enc('LDI', [R(16), I(0xff)])).toEqual([0xef0f]);
    expect(enc('LDI', [R(31), I(0x00)])).toEqual([0xe0f0]);
    expect(enc('LDI', [R(24), I(0x21)])).toEqual([0xe281]);
  });

  it('encodes ADD/ADC/SUB/AND/OR/EOR/MOV/CP family (Rd,Rr full range)', () => {
    expect(enc('ADD', [R(0), R(0)])).toEqual([0x0c00]);
    expect(enc('MOV', [R(16), R(0)])).toEqual([0x2d00]);
    expect(enc('EOR', [R(31), R(31)])).toEqual([0x27ff]);
  });

  it('encodes IN/OUT with a 6-bit I/O address', () => {
    // out SPL,r16 ; SPL I/O address is 0x3d
    expect(enc('OUT', [I(0x3d), R(16)])).toEqual([0xbf0d]);
    // in r16,0x3f (SREG)
    expect(enc('IN', [R(16), I(0x3f)])).toEqual([0xb70f]);
  });

  it('encodes RJMP/RCALL relative offsets, including negative (two-s-complement)', () => {
    expect(enc('RJMP', [I(0)])).toEqual([0xc000]);
    expect(enc('RJMP', [I(-1)])).toEqual([0xcfff]); // "here: rjmp here"
    expect(enc('RCALL', [I(-1)])).toEqual([0xdfff]);
  });

  it('encodes JMP/CALL 22-bit absolute addresses as two words', () => {
    expect(enc('JMP', [I(0)])).toEqual([0x940c, 0x0000]);
    expect(enc('CALL', [I(0)])).toEqual([0x940e, 0x0000]);
    expect(enc('CALL', [I(0x0600)])).toEqual([0x940e, 0x0600]);
  });

  it('encodes LDS/STS 32-bit direct addressing', () => {
    expect(enc('LDS', [R(16), I(0x0200)])).toEqual([0x9100, 0x0200]);
    expect(enc('STS', [I(0x0200), R(16)])).toEqual([0x9300, 0x0200]);
  });

  it('encodes ADIW/SBIW restricted register pairs', () => {
    expect(enc('ADIW', [R(24), I(1)])).toEqual([0x9601]);
    expect(enc('ADIW', [R(28), I(0x3f)])).toEqual([0x96ef]);
    expect(() => enc('ADIW', [R(25), I(1)])).toThrow();
  });

  it('encodes conditional branches with correct fixed s and signed k', () => {
    expect(enc('BREQ', [I(0)])).toEqual([0xf001]);
    expect(enc('BRNE', [I(0)])).toEqual([0xf401]);
    expect(enc('BREQ', [I(-1)])).toEqual([0xf3f9]);
  });

  it('encodes SBI/CBI/SBIC/SBIS with 5-bit I/O address + 3-bit bit index', () => {
    expect(enc('SBI', [I(0x0c), I(0)])).toEqual([0x9a60]);
    expect(enc('CBI', [I(0x0c), I(7)])).toEqual([0x9867]);
    expect(() => enc('SBI', [I(32), I(0)])).toThrow();
  });

  it('encodes LD/ST addressing-mode variants correctly', () => {
    expect(enc('LD', [R(16), PTR('X', 'plain')])).toEqual([0x910c]);
    expect(enc('LD', [R(16), PTR('X', 'postinc')])).toEqual([0x910d]);
    expect(enc('LD', [R(16), PTR('X', 'predec')])).toEqual([0x910e]);
    expect(enc('LD', [R(16), PTR('Y', 'plain')])).toEqual([0x8108]);
    expect(enc('LD', [R(16), PTR('Z', 'postinc')])).toEqual([0x9101]);
    expect(enc('LDD', [R(16), PTR('Y', 'disp', 5)])).toEqual([0x810d]);
    expect(enc('ST', [PTR('X', 'plain'), R(16)])).toEqual([0x930c]);
    expect(enc('STD', [PTR('Z', 'disp', 2), R(5)])).toEqual([0x8252]);
  });

  it('encodes SBRC/SBRS/BLD/BST bit-index forms', () => {
    expect(enc('SBRC', [R(16), I(0)])).toEqual([0xfd00]);
    expect(enc('SBRS', [R(16), I(7)])).toEqual([0xff07]);
    expect(enc('BST', [R(0), I(0)])).toEqual([0xfa00]);
    expect(enc('BLD', [R(0), I(0)])).toEqual([0xf800]);
  });

  it('rejects out-of-range operands', () => {
    expect(() => enc('LDI', [R(15), I(0)])).toThrow(); // Rd must be 16..31
    expect(() => enc('LDI', [R(16), I(256)])).toThrow();
    expect(() => enc('RJMP', [I(2048)])).toThrow();
    expect(() => enc('RJMP', [I(-2049)])).toThrow();
  });
});
