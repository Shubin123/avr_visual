import { describe, expect, it } from 'vitest';
import { PinState } from 'avr8js';
import { assemble } from '../isa/assembler';
import { Emulator } from './emulator';

describe('Emulator — assembled program driving real avr8js peripherals', () => {
  it('runs ldi/out and reflects the result on the real GPIO port', () => {
    const res = assemble(`
      .cseg
      .org 0
      ldi r16, 0xFF
      out DDRB, r16
      out PORTB, r16
      loop: rjmp loop
    `);
    expect(res.errors).toEqual([]);

    const emu = new Emulator(res.program);
    emu.run(3);

    expect(emu.ports.B.pinState(0)).toBe(PinState.High);
    expect(emu.ports.B.pinState(7)).toBe(PinState.High);
    expect(emu.cpu.pc).toBe(3);
  });

  it('drives the six-LED assignment pattern from examples/a2-signaling.asm', () => {
    const res = assemble(`
      .include "m2560def.inc"
      .cseg
      .org 0
      set_leds:
        push r23
        clr r23
        ldi r23, (1 << DDL1) | (1 << DDL3) | (1 << DDL5) | (1 << DDL7)
        sts ddrl, r23
        clr r23
        ldi r23, (1 << DDB1) | (1 << DDB3)
        out ddrb, r23
        clr r23
        sbrc r16, 0
          sbr r23, 0b10000000
        sbrc r16, 1
          sbr r23, 0b00100000
        sbrc r16, 2
          sbr r23, 0b00001000
        sbrc r16, 3
          sbr r23, 0b00000010
        sts portl, r23
        clr r23
        sbrc r16, 4
          sbr r23, 0b00001000
        sbrc r16, 5
          sbr r23, 0b00000010
        out portb, r23
        pop r23
        ret
      main:
        ldi r16, 0b00100001
        rcall set_leds
      stop: rjmp stop
    `);
    expect(res.errors).toEqual([]);

    const emu = new Emulator(res.program);
    // jump straight to `main` (skip past the set_leds subroutine body)
    emu.cpu.pc = res.labels.get('main')!.value;
    emu.run(40);

    // r16=0b00100001 -> leftmost (bit5) and rightmost (bit0) LEDs on, matching
    // the a2-signalling.asm set_leds mapping: bit5->PORTL7, bit0->PORTB1.
    expect(emu.ports.L.pinState(7)).toBe(PinState.High);
    expect(emu.ports.B.pinState(1)).toBe(PinState.High);
    expect(emu.ports.L.pinState(5)).toBe(PinState.Low);
    expect(emu.ports.L.pinState(3)).toBe(PinState.Low);
    expect(emu.ports.L.pinState(1)).toBe(PinState.Low);
    expect(emu.ports.B.pinState(3)).toBe(PinState.Low);
  });
});
