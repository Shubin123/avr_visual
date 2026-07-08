import { describe, expect, it } from 'vitest';
import { useAppStore, MAIN_FILE } from './store';

describe('project files + line breakpoints', () => {
  it('assembles a program against a user-added .inc file and stops at a line breakpoint inside it', () => {
    const store = useAppStore.getState();

    store.addProjectFile('mylib.inc');
    store.setActiveFile('mylib.inc');
    store.setActiveFileContent('my_routine:\n\tldi r16, 0x42\n\tret\n');
    store.setActiveFile(null);

    // .include must come after the entry-point rjmp (and before a resuming
    // .cseg with no .org), same as examples/lcd/hello_world.asm — otherwise
    // the included code and the caller's own code both land at address 0.
    const program = [
      '.cseg',
      '.org 0',
      '\trjmp start',
      '.include "mylib.inc"',
      '.cseg',
      'start:',
      '\trcall my_routine',
      'loop:',
      '\trjmp loop',
      '',
    ].join('\n');
    store.setSource(program);
    store.toggleBreakpointLine(MAIN_FILE, 9); // "\trjmp loop"

    store.assembleAndLoad();
    const s1 = useAppStore.getState();
    expect(s1.assembleResult?.success).toBe(true);
    expect(s1.emulator?.breakpoints.size).toBe(1);

    const { hitBreakpoint } = s1.emulator!.run(1000);
    expect(hitBreakpoint).toBe(true);
    expect(s1.emulator!.cpu.data[16]).toBe(0x42); // my_routine's `ldi r16, 0x42` ran first

    // Removing the project file drops its breakpoints too.
    store.removeProjectFile('mylib.inc');
    expect(useAppStore.getState().projectFiles['mylib.inc']).toBeUndefined();
  });
});
