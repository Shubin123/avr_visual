import { describe, expect, it } from 'vitest';
import { PinState } from 'avr8js';
import { HD44780, type LcdPinConfig } from './hd44780';

/** Minimal fake AVRIOPort: tracks bit state per port and notifies listeners on change. */
class FakePort {
  private bits = 0;
  private listeners: (() => void)[] = [];
  addListener(cb: () => void) {
    this.listeners.push(cb);
  }
  pinState(bit: number): PinState {
    return this.bits & (1 << bit) ? PinState.High : PinState.Low;
  }
  set(bit: number, value: boolean) {
    if (value) this.bits |= 1 << bit;
    else this.bits &= ~(1 << bit);
    for (const l of this.listeners) l();
  }
}

// Put every LCD line on its own single-bit fake port so each write triggers
// exactly the listener(s) the real multi-port wiring would.
const pins: LcdPinConfig = {
  rs: { port: 'RS', bit: 0 },
  en: { port: 'EN', bit: 0 },
  d4: { port: 'D4', bit: 0 },
  d5: { port: 'D5', bit: 0 },
  d6: { port: 'D6', bit: 0 },
  d7: { port: 'D7', bit: 0 },
};

function makeHarness() {
  const ports = {
    RS: new FakePort(),
    EN: new FakePort(),
    D4: new FakePort(),
    D5: new FakePort(),
    D6: new FakePort(),
    D7: new FakePort(),
  };
  const lcd = new HD44780(ports as never, pins);

  function sendNibble(rs: boolean, nibble: number) {
    ports.RS.set(0, rs);
    ports.D4.set(0, !!(nibble & 1));
    ports.D5.set(0, !!(nibble & 2));
    ports.D6.set(0, !!(nibble & 4));
    ports.D7.set(0, !!(nibble & 8));
    ports.EN.set(0, true);
    ports.EN.set(0, false); // falling edge latches the nibble
  }

  function sendByte(rs: boolean, byte: number) {
    sendNibble(rs, (byte >> 4) & 0xf);
    sendNibble(rs, byte & 0xf);
  }

  return { lcd, sendByte };
}

describe('HD44780', () => {
  it('runs a typical 4-bit init sequence and displays written characters', () => {
    const { lcd, sendByte } = makeHarness();

    sendByte(false, 0x28); // function set: 4-bit, 2-line
    sendByte(false, 0x0c); // display on, cursor off, blink off
    sendByte(false, 0x06); // entry mode: increment, no shift
    sendByte(false, 0x01); // clear display

    sendByte(true, 'H'.charCodeAt(0));
    sendByte(true, 'I'.charCodeAt(0));

    const state = lcd.getDisplayState();
    expect(state.characters[0]).toBe('H'.charCodeAt(0));
    expect(state.characters[1]).toBe('I'.charCodeAt(0));
    expect(state.characters[2]).toBe(0x20); // rest of row is blank-filled
    expect(state.displayOn).toBe(true);
    expect(state.cursorX).toBe(2);
    expect(state.cursorY).toBe(0);
  });

  it('positions the cursor on row 2 via the set-DDRAM-address command', () => {
    const { lcd, sendByte } = makeHarness();
    sendByte(false, 0x28);
    sendByte(false, 0x0c);
    sendByte(false, 0x01);

    sendByte(false, 0x80 | 0x40); // set DDRAM address to row 2, col 0
    sendByte(true, 'Z'.charCodeAt(0));

    const state = lcd.getDisplayState();
    expect(state.characters[16]).toBe('Z'.charCodeAt(0));
    expect(state.cursorY).toBe(1);
  });
});
