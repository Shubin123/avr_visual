import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../state/store';
import { Panel } from './RegisterTable';

interface LineEntry {
  addr: number;
  line: number;
  text: string;
}

export function Disassembly() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  const assembleResult = useAppStore((s) => s.assembleResult);
  const source = useAppStore((s) => s.source);
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoint = useAppStore((s) => s.toggleBreakpoint);
  void generation;

  const entries = useMemo<LineEntry[]>(() => {
    if (!assembleResult) return [];
    const sourceLines = source.split(/\r\n|\r|\n/);
    const byLine = new Map<number, number>(); // line -> first (lowest) address
    for (const [addr, loc] of assembleResult.sourceMap) {
      if (loc.file !== 'main.asm') continue;
      const existing = byLine.get(loc.line);
      if (existing === undefined || addr < existing) byLine.set(loc.line, addr);
    }
    return Array.from(byLine.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([line, addr]) => ({ addr, line, text: sourceLines[line - 1] ?? '' }));
  }, [assembleResult, source]);

  const currentAddr = emulator?.cpu.pc ?? -1;
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
    // Only scroll on generation changes tied to execution, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddr, generation]);

  if (!assembleResult) return <Panel title="Disassembly">No program loaded.</Panel>;

  return (
    <Panel title="Disassembly">
      <div className="disasm-list" ref={listRef}>
        {entries.map((e) => {
          const isCurrent = e.addr === currentAddr;
          const hasBp = breakpoints.has(e.addr);
          return (
            <div
              key={e.addr}
              ref={isCurrent ? currentRef : undefined}
              className={`disasm-row ${isCurrent ? 'current' : ''}`}
            >
              <button
                className={`bp-dot ${hasBp ? 'active' : ''}`}
                title="Toggle breakpoint"
                onClick={() => toggleBreakpoint(e.addr)}
              />
              <span className="mono dim disasm-addr">0x{e.addr.toString(16).padStart(4, '0')}</span>
              <span className="mono disasm-text">{e.text}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
