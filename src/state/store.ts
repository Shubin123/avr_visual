import { create } from 'zustand';
import { assemble, type AssembleResult } from '../isa/assembler';
import { Emulator } from '../emulator/emulator';
import { HD44780, type LcdDisplayState } from '../emulator/hd44780';
import type { LcdKeypadButton } from '../emulator/emulator';
import a2Signaling from '../../examples/a2-signaling.asm?raw';
import multiTimer from '../../examples/multi_timer.asm?raw';
import ledCycleDemo from '../../examples/led-cycle-demo.asm?raw';

export const EXAMPLES: Record<string, string> = {
  'led-cycle-demo.asm': ledCycleDemo,
  'a2-signaling.asm': a2Signaling,
  'multi_timer.asm': multiTimer,
};

const blankLcdState: LcdDisplayState = {
  characters: new Uint8Array(32).fill(0x20),
  cursor: false,
  blink: false,
  cursorX: 0,
  cursorY: 0,
  displayOn: false,
};

interface AppState {
  source: string;
  assembleResult: AssembleResult | null;
  emulator: Emulator | null;
  lcd: HD44780 | null;
  lcdState: LcdDisplayState;
  running: boolean;
  instructionsPerFrame: number;
  breakpoints: Set<number>;
  generation: number;
  activeButton: LcdKeypadButton;
  statusMessage: string;

  setSource: (s: string) => void;
  loadExample: (name: string) => void;
  assembleAndLoad: () => void;
  step: () => void;
  stepOver: () => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  toggleBreakpoint: (addr: number) => void;
  setButton: (b: LcdKeypadButton) => void;
  setSpeed: (instructionsPerFrame: number) => void;
  bumpGeneration: () => void;
}

let rafHandle: number | null = null;

function stopLoop() {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  source: EXAMPLES['led-cycle-demo.asm'],
  assembleResult: null,
  emulator: null,
  lcd: null,
  lcdState: blankLcdState,
  running: false,
  instructionsPerFrame: 2000,
  breakpoints: new Set(),
  generation: 0,
  activeButton: 'none',
  statusMessage: 'Not assembled yet.',

  setSource: (s) => set({ source: s }),

  loadExample: (name) => {
    stopLoop();
    const src = EXAMPLES[name];
    if (src === undefined) return;
    set({
      source: src,
      assembleResult: null,
      emulator: null,
      lcd: null,
      running: false,
      breakpoints: new Set(),
      statusMessage: `Loaded ${name} — click Assemble to build it.`,
    });
  },

  assembleAndLoad: () => {
    stopLoop();
    const { source, breakpoints } = get();
    const result = assemble(source);
    if (!result.success) {
      set({
        assembleResult: result,
        emulator: null,
        lcd: null,
        running: false,
        statusMessage: `Assembly failed: ${result.errors.length} error(s).`,
      });
      return;
    }
    const emulator = new Emulator(result.program);
    for (const addr of breakpoints) emulator.breakpoints.add(addr);
    const lcd = new HD44780(emulator.ports);
    lcd.onChange = () => {
      set({ lcdState: lcd.getDisplayState() });
    };
    set({
      assembleResult: result,
      emulator,
      lcd,
      lcdState: lcd.getDisplayState(),
      running: false,
      generation: get().generation + 1,
      statusMessage: `Assembled OK — ${result.warnings.length} warning(s).`,
    });
  },

  step: () => {
    const { emulator } = get();
    if (!emulator) return;
    emulator.step();
    set({ generation: get().generation + 1 });
  },

  stepOver: () => {
    // "Step over": if the current instruction is a CALL/RCALL, run until the
    // stack pointer returns to (at least) its pre-call depth; otherwise just step.
    const { emulator } = get();
    if (!emulator) return;
    const spBefore = emulator.cpu.SP;
    emulator.step();
    if (emulator.cpu.SP < spBefore) {
      const targetSp = spBefore;
      for (let i = 0; i < 200000 && emulator.cpu.SP < targetSp; i++) {
        emulator.step();
      }
    }
    set({ generation: get().generation + 1 });
  },

  play: () => {
    const { emulator, running } = get();
    if (!emulator || running) return;
    set({ running: true, statusMessage: 'Running…' });
    const loop = () => {
      const state = get();
      if (!state.running || !state.emulator) return;
      const { hitBreakpoint } = state.emulator.run(state.instructionsPerFrame);
      set({ generation: state.generation + 1 });
      if (hitBreakpoint) {
        set({ running: false, statusMessage: `Stopped at breakpoint (PC=0x${state.emulator.cpu.pc.toString(16)}).` });
        return;
      }
      rafHandle = requestAnimationFrame(loop);
    };
    rafHandle = requestAnimationFrame(loop);
  },

  pause: () => {
    stopLoop();
    set({ running: false, statusMessage: 'Paused.' });
  },

  reset: () => {
    stopLoop();
    const { emulator, lcd } = get();
    emulator?.reset();
    if (lcd) set({ lcdState: lcd.getDisplayState() });
    set({ running: false, generation: get().generation + 1, statusMessage: 'Reset.' });
  },

  toggleBreakpoint: (addr) => {
    const { breakpoints, emulator } = get();
    const next = new Set(breakpoints);
    if (next.has(addr)) {
      next.delete(addr);
      emulator?.breakpoints.delete(addr);
    } else {
      next.add(addr);
      emulator?.breakpoints.add(addr);
    }
    set({ breakpoints: next });
  },

  setButton: (b) => {
    const { emulator } = get();
    emulator?.setButton(b);
    set({ activeButton: b });
  },

  setSpeed: (instructionsPerFrame) => set({ instructionsPerFrame }),

  bumpGeneration: () => set({ generation: get().generation + 1 }),
}));
