// Arduino Mega 2560 digital-pin-number -> ATmega2560 port/bit mapping.
// Source of truth: ArduinoCore-avr variants/mega/pins_arduino.h
// (digital_pin_to_port_PGM / digital_pin_to_bit_mask_PGM). Pins 54-69 are A0-A15.
export interface PortBit {
  port: string;
  bit: number;
}

export const ARDUINO_MEGA_PINS: Record<number, PortBit> = {
  0: { port: 'E', bit: 0 },
  1: { port: 'E', bit: 1 },
  2: { port: 'E', bit: 4 },
  3: { port: 'E', bit: 5 },
  4: { port: 'G', bit: 5 },
  5: { port: 'E', bit: 3 },
  6: { port: 'H', bit: 3 },
  7: { port: 'H', bit: 4 },
  8: { port: 'H', bit: 5 },
  9: { port: 'H', bit: 6 },
  10: { port: 'B', bit: 4 },
  11: { port: 'B', bit: 5 },
  12: { port: 'B', bit: 6 },
  13: { port: 'B', bit: 7 },
  14: { port: 'J', bit: 1 },
  15: { port: 'J', bit: 0 },
  16: { port: 'H', bit: 1 },
  17: { port: 'H', bit: 0 },
  18: { port: 'D', bit: 3 },
  19: { port: 'D', bit: 2 },
  20: { port: 'D', bit: 1 },
  21: { port: 'D', bit: 0 },
  22: { port: 'A', bit: 0 },
  23: { port: 'A', bit: 1 },
  24: { port: 'A', bit: 2 },
  25: { port: 'A', bit: 3 },
  26: { port: 'A', bit: 4 },
  27: { port: 'A', bit: 5 },
  28: { port: 'A', bit: 6 },
  29: { port: 'A', bit: 7 },
  30: { port: 'C', bit: 7 },
  31: { port: 'C', bit: 6 },
  32: { port: 'C', bit: 5 },
  33: { port: 'C', bit: 4 },
  34: { port: 'C', bit: 3 },
  35: { port: 'C', bit: 2 },
  36: { port: 'C', bit: 1 },
  37: { port: 'C', bit: 0 },
  38: { port: 'D', bit: 7 },
  39: { port: 'G', bit: 2 },
  40: { port: 'G', bit: 1 },
  41: { port: 'G', bit: 0 },
  42: { port: 'L', bit: 7 },
  43: { port: 'L', bit: 6 },
  44: { port: 'L', bit: 5 },
  45: { port: 'L', bit: 4 },
  46: { port: 'L', bit: 3 },
  47: { port: 'L', bit: 2 },
  48: { port: 'L', bit: 1 },
  49: { port: 'L', bit: 0 },
  50: { port: 'B', bit: 3 },
  51: { port: 'B', bit: 2 },
  52: { port: 'B', bit: 1 },
  53: { port: 'B', bit: 0 },
  54: { port: 'F', bit: 0 }, // A0
  55: { port: 'F', bit: 1 }, // A1
  56: { port: 'F', bit: 2 }, // A2
  57: { port: 'F', bit: 3 }, // A3
  58: { port: 'F', bit: 4 }, // A4
  59: { port: 'F', bit: 5 }, // A5
  60: { port: 'F', bit: 6 }, // A6
  61: { port: 'F', bit: 7 }, // A7
  62: { port: 'K', bit: 0 }, // A8
  63: { port: 'K', bit: 1 }, // A9
  64: { port: 'K', bit: 2 }, // A10
  65: { port: 'K', bit: 3 }, // A11
  66: { port: 'K', bit: 4 }, // A12
  67: { port: 'K', bit: 5 }, // A13
  68: { port: 'K', bit: 6 }, // A14
  69: { port: 'K', bit: 7 }, // A15
};

export function analogPin(n: number): number {
  return 54 + n;
}
