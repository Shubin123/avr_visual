import { describe, expect, it } from 'vitest';
import { assemble } from './assembler';
import a2Signaling from '../../examples/a2-signaling.asm?raw';
import multiTimer from '../../examples/multi_timer.asm?raw';

describe('assembler — small hand-written programs', () => {
  it('assembles a minimal program with labels, .equ, .def, and branches', () => {
    const src = `
      .include "m2560def.inc"
      .def temp = r16
      .equ FOO = 5
      .cseg
      .org 0
      start:
        ldi temp, FOO
        out DDRB, temp
      loop:
        rjmp loop
    `;
    const res = assemble(src);
    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
    expect(res.labels.get('start')?.value).toBe(0);
    expect(res.labels.get('loop')?.value).toBe(2);
    // ldi r16,5
    expect(res.program[0]).toBe(0xe005);
    // rjmp loop -> k = 2 - (2+1) = -1
    expect(res.program[2]).toBe(0xcfff);
  });

  it('reports an error for unknown instructions and undefined symbols', () => {
    const res = assemble(`
      .cseg
      frobnicate r16
    `);
    expect(res.success).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('supports .db string + byte packing with word alignment padding', () => {
    const src = `
      .cseg
      .org 0
      nop
      table:
        .db "AB", 1
      after:
        nop
    `;
    const res = assemble(src);
    expect(res.errors).toEqual([]);
    expect(res.labels.get('table')?.value).toBe(1);
    // "AB",1 = 3 bytes -> word1 = 'A'|('B'<<8), word2 = 1 | (pad<<8)
    expect(res.program[1]).toBe(0x42_41); // 'B'=0x42 hi, 'A'=0x41 lo
    expect(res.program[2]).toBe(0x0001);
    expect(res.labels.get('after')?.value).toBe(3);
  });

  it('evaluates #define-driven floating point .equ expressions and .if/.error', () => {
    const src = `
      #define CLOCK 16.0e6
      .equ PRESCALE = 1024
      #define DELAY 0.5
      .equ TOP = int(0.5+(CLOCK/PRESCALE*DELAY))
      .if TOP > 65535
      .error "TOP too big"
      .endif
      .cseg
      ldi r16, low(TOP)
      ldi r17, high(TOP)
    `;
    const res = assemble(src);
    expect(res.errors).toEqual([]);
    const expectedTop = Math.trunc(0.5 + (16.0e6 / 1024) * 0.5);
    // Decode the two `ldi` opcodes (pattern 1110 KKKK dddd KKKK, d=0 for r16/r17)
    // and reassemble their K fields rather than re-deriving the opcode by hand.
    const decodeLdiK = (word: number) => (((word >> 8) & 0xf) << 4) | (word & 0xf);
    expect(decodeLdiK(res.program[0])).toBe(expectedTop & 0xff);
    expect(decodeLdiK(res.program[1])).toBe((expectedTop >> 8) & 0xff);
  });
});

describe('assembler — real course examples', () => {
  it('assembles examples/a2-signaling.asm with no errors', () => {
    const src = a2Signaling;
    const res = assemble(src);
    if (!res.success) {
      console.error(res.errors);
    }
    expect(res.errors).toEqual([]);
    expect(res.labels.has('set_leds')).toBe(true);
    expect(res.labels.has('display_message')).toBe(true);
    // PATTERNS table is placed at .org 0x600
    expect(res.labels.get('PATTERNS')?.value).toBe(0x600);
  });

  it('assembles examples/multi_timer.asm with no errors', () => {
    const src = multiTimer;
    const res = assemble(src);
    if (!res.success) {
      console.error(res.errors);
    }
    expect(res.errors).toEqual([]);
    expect(res.labels.has('main_loop')).toBe(true);
  });
});
