# Mega Visualizer

A browser-based AVR assembler and visual debugger for the ATmega2560 (Arduino
Mega 2560), built around a real HD44780 LCD and the 6-LED module used in the
course examples under `examples/`. Write AVR assembly, assemble it, and watch
it run against a real instruction-accurate CPU core — with a live register
file, SREG flags, stack, memory map, disassembly, and the actual board/LCD/LED
state updating as the program executes.

## Running it

```bash
npm install
npm run dev      # starts the Vite dev server
npm test         # runs the assembler/encoder/emulator test suite
npm run build    # type-checks and produces a production build
```

## Architecture

- **`src/isa/instructions.ts`** — the AVR instruction encoder. Every opcode
  bit pattern is transcribed directly from the official Microchip *AVR
  Instruction Set Manual* (DS40002198) and packed generically from a
  bit-template string, so the mapping from mnemonic to machine code is
  auditable against the manual rather than hand-derived.
- **`src/isa/expr.ts`**, **`src/isa/preprocess.ts`**, **`src/isa/assembler.ts`**
  — a from-scratch two-pass AVR assembler: a C-style preprocessor
  (`#define`/`#ifdef`/`#ifndef`/`.include`), an expression evaluator
  (floating point, `low()`/`high()`/`int()`, etc. — needed for course code
  like `multi_timer.asm`'s timer-constant math), and the pass 1 (symbol
  table)/pass 2 (encode) assembler itself.
- **`src/mega2560/`** — the ATmega2560 device model. `m2560def.inc` is the
  *actual* Microchip device header (the same one referenced by
  `.include "m2560def.inc"` in course code), bundled so it works with no
  upload step; `sfr-map.generated.ts` and `register-names.generated.ts` are
  mechanically generated from it (not hand-transcribed) to avoid address
  transcription errors; `device.ts` builds the avr8js peripheral configs
  (GPIO ports A-L, timers 0-5, ADC) from those addresses.
- **`src/emulator/`** — wraps the [avr8js](https://github.com/wokwi/avr8js)
  CPU core (the same engine behind Wokwi's Arduino simulator) with the
  ATmega2560 peripheral set, plus a from-scratch HD44780 controller
  simulation that watches GPIO pin state directly (so it works with anyone's
  LCD driver code, not just one specific library).
- **`src/ui/`** — the React UI: a CodeMirror-based editor with AVR-asm syntax
  highlighting, the debugger panels (registers, SREG, stack, memory map,
  disassembly with breakpoints), and the hardware panel using
  [`@wokwi/elements`](https://github.com/wokwi/wokwi-elements) for the LED/LCD/
  pushbutton visuals.

## Default hardware wiring

The board matches the classic LCD keypad shield used in the course material:

- LCD (4-bit interface): RS=D8, E=D9, D4-D7=D4-D7 (see `src/emulator/hd44780.ts`)
- Buttons: a single analog pin (ADC0) with the shield's usual resistor-ladder
  ranges (see `src/emulator/emulator.ts`)
- LEDs: the six-LED module from `examples/a2-signaling.asm` — PORTL7/5/3/1 and
  PORTB3/1 (see `src/ui/HardwarePanel.tsx`)

## Known limitations

- External/pin-change interrupts (INT0-7, PCINT) are not modeled — the
  ATmega2560's pin-to-interrupt mapping differs substantially from the
  ATmega328p configs avr8js ships, and neither reference program needs them
  (only timer and ADC interrupts are used). Timer and ADC interrupts work.
- USART, SPI, and TWI peripherals are not wired up.
- LPM/ELPM/JMP/CALL address the full 22-bit space, but RAMPZ-based access
  beyond the first 64K words of flash isn't modeled.
- PWM/timer compare-output pin overrides use best-effort Arduino Mega pin
  mappings; timing/counting/interrupt behavior is verified, waveform output
  on physical pins is not the focus of this tool.
