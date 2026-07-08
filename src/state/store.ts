import { create } from 'zustand';
import { assemble, lineAddressMap, type AssembleResult } from '../isa/assembler';
import { Emulator } from '../emulator/emulator';
import { HD44780, type LcdDisplayState } from '../emulator/hd44780';
import type { LcdKeypadButton } from '../emulator/emulator';
import a2Signaling from '../../examples/a2-signaling.asm?raw';
import multiTimer from '../../examples/multi_timer.asm?raw';
import ledCycleDemo from '../../examples/led-cycle-demo.asm?raw';
import lcdHelloWorld from '../../examples/lcd/hello_world.asm?raw';

export const EXAMPLES: Record<string, string> = {
  'led-cycle-demo.asm': ledCycleDemo,
  'lcd/hello_world.asm': lcdHelloWorld,
  'a2-signaling.asm': a2Signaling,
  'multi_timer.asm': multiTimer,
};

/** Filename the top-level editor's `source` is assembled as (matches the assembler's default). */
export const MAIN_FILE = 'main.asm';

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
  /** Extra project files (e.g. a student's own .inc/.asm driver), keyed by
   *  filename exactly as referenced in `.include "..."`. */
  projectFiles: Record<string, string>;
  /** Which file the editor is currently showing: null = `source` (MAIN_FILE), else a key into projectFiles. */
  activeFile: string | null;
  assembleResult: AssembleResult | null;
  emulator: Emulator | null;
  lcd: HD44780 | null;
  lcdState: LcdDisplayState;
  running: boolean;
  instructionsPerFrame: number;
  /** Breakpoints by source line, keyed by filename (MAIN_FILE or a project file). */
  breakpointsByFile: Record<string, Set<number>>;
  generation: number;
  activeButton: LcdKeypadButton;
  statusMessage: string;

  setSource: (s: string) => void;
  setActiveFile: (name: string | null) => void;
  setActiveFileContent: (content: string) => void;
  addProjectFile: (name: string) => void;
  removeProjectFile: (name: string) => void;
  loadExample: (name: string) => void;
  assembleAndLoad: () => void;
  step: () => void;
  stepOver: () => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  toggleBreakpointLine: (file: string, line: number) => void;
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
  projectFiles: {},
  activeFile: null,
  assembleResult: null,
  emulator: null,
  lcd: null,
  lcdState: blankLcdState,
  running: false,
  instructionsPerFrame: 2000,
  breakpointsByFile: {},
  generation: 0,
  activeButton: 'none',
  statusMessage: 'Not assembled yet.',

  setSource: (s) => set({ source: s }),

  setActiveFile: (name) => set({ activeFile: name }),

  setActiveFileContent: (content) => {
    const { activeFile } = get();
    if (activeFile === null) {
      set({ source: content });
    } else {
      set((state) => ({ projectFiles: { ...state.projectFiles, [activeFile]: content } }));
    }
  },

  addProjectFile: (name) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.toLowerCase() === MAIN_FILE) return;
    const { projectFiles } = get();
    if (trimmed in projectFiles) {
      set({ activeFile: trimmed });
      return;
    }
    set({
      projectFiles: { ...projectFiles, [trimmed]: `; ${trimmed}\n` },
      activeFile: trimmed,
    });
  },

  removeProjectFile: (name) => {
    const { projectFiles, activeFile, breakpointsByFile } = get();
    if (!(name in projectFiles)) return;
    const nextFiles = { ...projectFiles };
    delete nextFiles[name];
    const nextBreakpoints = { ...breakpointsByFile };
    delete nextBreakpoints[name];
    set({
      projectFiles: nextFiles,
      activeFile: activeFile === name ? null : activeFile,
      breakpointsByFile: nextBreakpoints,
    });
  },

  loadExample: (name) => {
    stopLoop();
    const src = EXAMPLES[name];
    if (src === undefined) return;
    set({
      source: src,
      projectFiles: {},
      activeFile: null,
      assembleResult: null,
      emulator: null,
      lcd: null,
      running: false,
      breakpointsByFile: {},
      statusMessage: `Loaded ${name} — click Assemble to build it.`,
    });
  },

  assembleAndLoad: () => {
    stopLoop();
    const { source, projectFiles, breakpointsByFile } = get();
    const result = assemble(source, MAIN_FILE, projectFiles);
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
    for (const [file, lines] of Object.entries(breakpointsByFile)) {
      const addrForLine = lineAddressMap(result.sourceMap, file);
      for (const line of lines) {
        const addr = addrForLine.get(line);
        if (addr !== undefined) emulator.breakpoints.add(addr);
      }
    }
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

  toggleBreakpointLine: (file, line) => {
    const { breakpointsByFile, emulator, assembleResult } = get();
    const current = breakpointsByFile[file] ?? new Set<number>();
    const next = new Set(current);
    const removing = next.has(line);
    if (removing) next.delete(line);
    else next.add(line);
    set({ breakpointsByFile: { ...breakpointsByFile, [file]: next } });

    // Keep a live emulator's breakpoint set in sync immediately, without
    // requiring a re-assemble, exactly like editing while paused expects.
    if (emulator && assembleResult) {
      const addr = lineAddressMap(assembleResult.sourceMap, file).get(line);
      if (addr !== undefined) {
        if (removing) emulator.breakpoints.delete(addr);
        else emulator.breakpoints.add(addr);
      }
    }
  },

  setButton: (b) => {
    const { emulator } = get();
    emulator?.setButton(b);
    set({ activeButton: b });
  },

  setSpeed: (instructionsPerFrame) => set({ instructionsPerFrame }),

  bumpGeneration: () => set({ generation: get().generation + 1 }),
}));
