// HD44780 LCD controller simulation, driven purely by watching GPIO pin
// state through avr8js AVRIOPort listeners — no changes to the CPU/assembler
// are needed for this to work with arbitrary student code, since it reacts
// to whatever RS/E/D4-D7 pins the program actually toggles.
//
// Wiring defaults to the classic "LCD keypad shield" (4-bit interface, RW
// tied to GND): RS=D8, E=D9, D4=D4, D5=D5, D6=D6, D7=D7. This matches the
// board the course's a3-description.pdf LCD/button assignment is built
// around (buttons read via ADC0, ranges consistent with that shield).
import { PinState, type AVRIOPort } from 'avr8js';
import { ARDUINO_MEGA_PINS } from '../mega2560/arduino-pins';

export interface LcdPin {
  port: string;
  bit: number;
}

export interface LcdPinConfig {
  rs: LcdPin;
  en: LcdPin;
  d4: LcdPin;
  d5: LcdPin;
  d6: LcdPin;
  d7: LcdPin;
}

function fromArduinoPin(pin: number): LcdPin {
  const p = ARDUINO_MEGA_PINS[pin];
  return { port: p.port, bit: p.bit };
}

export const DEFAULT_LCD_PINS: LcdPinConfig = {
  rs: fromArduinoPin(8),
  en: fromArduinoPin(9),
  d4: fromArduinoPin(4),
  d5: fromArduinoPin(5),
  d6: fromArduinoPin(6),
  d7: fromArduinoPin(7),
};

export interface LcdDisplayState {
  characters: Uint8Array; // 32 bytes: 16 for row 0, 16 for row 1
  cursor: boolean;
  blink: boolean;
  cursorX: number;
  cursorY: number;
  displayOn: boolean;
}

const ROW_BASE = [0x00, 0x40];
const ROW_BYTES = 40;

export class HD44780 {
  private ddram = new Uint8Array(80).fill(0x20);
  private cgram = new Uint8Array(64);
  private addressCounter = 0;
  private inCgramMode = false;
  private entryIncrement = true;
  private displayOn = true;
  private cursorOn = false;
  private blinkOn = false;
  private displayShift = 0; // 0..39 scroll offset shared by both rows

  private lastEn = false;
  private nibbleHigh: number | null = null;

  private ports: Record<string, AVRIOPort>;
  private pins: LcdPinConfig;
  onChange: () => void = () => {};

  constructor(ports: Record<string, AVRIOPort>, pins: LcdPinConfig = DEFAULT_LCD_PINS) {
    this.ports = ports;
    this.pins = pins;
    const watched = new Set([pins.rs.port, pins.en.port, pins.d4.port, pins.d5.port, pins.d6.port, pins.d7.port]);
    for (const portName of watched) {
      this.ports[portName]?.addListener(() => this.sample());
    }
  }

  private readBit(pin: LcdPin): boolean {
    const port = this.ports[pin.port];
    if (!port) return false;
    return port.pinState(pin.bit) === PinState.High;
  }

  private sample() {
    const en = this.readBit(this.pins.en);
    if (this.lastEn && !en) {
      const rs = this.readBit(this.pins.rs);
      const nibble =
        (this.readBit(this.pins.d4) ? 1 : 0) |
        (this.readBit(this.pins.d5) ? 2 : 0) |
        (this.readBit(this.pins.d6) ? 4 : 0) |
        (this.readBit(this.pins.d7) ? 8 : 0);
      this.latchNibble(rs, nibble);
    }
    this.lastEn = en;
  }

  private latchNibble(rs: boolean, nibble: number) {
    if (this.nibbleHigh === null) {
      this.nibbleHigh = nibble;
      return;
    }
    const byte = (this.nibbleHigh << 4) | nibble;
    this.nibbleHigh = null;
    if (rs) this.writeData(byte);
    else this.writeCommand(byte);
    this.onChange();
  }

  private advanceAddress(dir: 1 | -1) {
    if (this.inCgramMode) {
      this.addressCounter = (this.addressCounter + dir) & 0x3f;
      return;
    }
    let addr = this.addressCounter + dir;
    // 2-line DDRAM addressing skips the 0x28-0x3F "dead zone" between rows.
    if (dir > 0) {
      if (addr === 0x28) addr = 0x40;
      else if (addr === 0x68) addr = 0x00;
    } else {
      if (addr === 0x3f) addr = 0x27;
      else if (addr === -1) addr = 0x67;
    }
    this.addressCounter = addr;
  }

  private writeCommand(byte: number) {
    if (byte & 0x80) {
      // Set DDRAM address
      this.addressCounter = byte & 0x7f;
      this.inCgramMode = false;
    } else if (byte & 0x40) {
      // Set CGRAM address
      this.addressCounter = byte & 0x3f;
      this.inCgramMode = true;
    } else if (byte & 0x20) {
      // Function set — interface width/line count/font are fixed by our
      // hardwired 4-bit, 2-line wiring, so nothing to track here.
    } else if (byte & 0x10) {
      // Cursor/display shift
      const shiftDisplay = (byte & 0x08) !== 0;
      const right = (byte & 0x04) !== 0;
      const dir = right ? 1 : -1;
      if (shiftDisplay) this.displayShift = (this.displayShift + dir + ROW_BYTES) % ROW_BYTES;
      else this.advanceAddress(dir);
    } else if (byte & 0x08) {
      // Display on/off control
      this.displayOn = (byte & 0x04) !== 0;
      this.cursorOn = (byte & 0x02) !== 0;
      this.blinkOn = (byte & 0x01) !== 0;
    } else if (byte & 0x04) {
      // Entry mode set
      this.entryIncrement = (byte & 0x02) !== 0;
      // Display-shift-on-write (the S bit) is rarely used by course code and
      // is intentionally not modeled; writes only move the cursor.
    } else if (byte & 0x02) {
      // Return home
      this.addressCounter = 0;
      this.displayShift = 0;
    } else if (byte & 0x01) {
      // Clear display
      this.ddram.fill(0x20);
      this.addressCounter = 0;
      this.displayShift = 0;
      this.entryIncrement = true;
    }
  }

  private writeData(byte: number) {
    if (this.inCgramMode) {
      this.cgram[this.addressCounter & 0x3f] = byte;
    } else {
      this.ddram[this.addressCounter & 0x7f] = byte;
    }
    this.advanceAddress(this.entryIncrement ? 1 : -1);
  }

  getDisplayState(): LcdDisplayState {
    const characters = new Uint8Array(32);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        const ddramCol = (col + this.displayShift) % ROW_BYTES;
        characters[row * 16 + col] = this.ddram[ROW_BASE[row] + ddramCol];
      }
    }
    const addr = this.addressCounter;
    const row = addr >= 0x40 ? 1 : 0;
    const rawCol = addr - ROW_BASE[row];
    const cursorX = ((rawCol - this.displayShift + ROW_BYTES) % ROW_BYTES) % 16;
    return {
      characters,
      cursor: this.cursorOn,
      blink: this.blinkOn,
      cursorX,
      cursorY: row,
      displayOn: this.displayOn,
    };
  }
}
