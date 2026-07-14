// Wraps avr8js's CPU core with the ATmega2560 peripheral set (GPIO ports A-L,
// timers 0-5, ADC) and a small step/run/breakpoint API for the debugger UI.
import { AVRADC, AVRIOPort, AVRTimer, CPU, avrInstruction } from 'avr8js';
import { allTimerConfigs, CPU_SRAM_BYTES, mega2560AdcConfig, mega2560Ports, RAMEND } from '../mega2560/device';

export type LcdKeypadButton = 'none' | 'right' | 'up' | 'down' | 'left' | 'select';

/** Approximate ADC codes for the classic DFRobot-style LCD keypad shield's resistor ladder (channel 0). */
const BUTTON_ADC_CODE: Record<LcdKeypadButton, number> = {
  right: 0,
  up: 131,
  down: 307,
  left: 481,
  select: 741,
  none: 1023,
};

export class Emulator {
  program: Uint16Array;
  cpu!: CPU;
  ports!: Record<string, AVRIOPort>;
  timers!: AVRTimer[];
  adc!: AVRADC;
  breakpoints = new Set<number>();
  /** Total instructions retired since the last reset (for the debugger's cycle/step counters). */
  instructionsRetired = 0;

  constructor(program: Uint16Array) {
    this.program = program;
    this.initPeripherals();
  }

  private initPeripherals() {
    // ATmega2560 has 256KB of flash (128K words = 131072 words).
    // avr8js determines PC size (2 bytes vs 3 bytes) based on program.length.
    // We pad the program to the full 128K words so avr8js correctly uses a 3-byte PC,
    // which matches the compiled assembly's stack offset expectation (SP_OFFSET = 3).
    const paddedProgram = new Uint16Array(131072);
    paddedProgram.set(this.program);

    this.cpu = new CPU(paddedProgram, CPU_SRAM_BYTES);
    this.cpu.SP = RAMEND;
    this.ports = {};
    for (const [name, cfg] of Object.entries(mega2560Ports)) {
      this.ports[name] = new AVRIOPort(this.cpu, cfg);
    }
    this.timers = allTimerConfigs.map((cfg) => new AVRTimer(this.cpu, cfg));
    this.adc = new AVRADC(this.cpu, mega2560AdcConfig);
    this.adc.channelValues[0] = (BUTTON_ADC_CODE.none / 1024) * 5;
    this.instructionsRetired = 0;
  }

  reset() {
    this.initPeripherals();
  }

  setButton(button: LcdKeypadButton) {
    this.adc.channelValues[0] = (BUTTON_ADC_CODE[button] / 1024) * 5;
  }

  /** Executes exactly one instruction (plus any interrupt/timer servicing due at this cycle). */
  step(): void {
    avrInstruction(this.cpu);
    this.cpu.tick();
    this.instructionsRetired++;
  }

  /**
   * Runs up to `maxInstructions`, stopping early if a breakpoint is hit
   * (checked *before* executing the instruction at that address, so a
   * breakpoint on the current PC when already stopped there won't re-trigger
   * until execution moves away and back).
   */
  run(maxInstructions: number): { hitBreakpoint: boolean; ranInstructions: number } {
    for (let i = 0; i < maxInstructions; i++) {
      if (i > 0 && this.breakpoints.has(this.cpu.pc)) {
        return { hitBreakpoint: true, ranInstructions: i };
      }
      this.step();
    }
    return { hitBreakpoint: false, ranInstructions: maxInstructions };
  }
}
