import { useEffect, useMemo, useRef } from 'react';
import { lineAddressMap } from '../isa/assembler';
import { MAIN_FILE, useAppStore } from '../state/store';
import { Panel } from './RegisterTable';

interface LineEntry {
  addr: number;
  line: number;
  text: string;
}

const EMPTY_SET: ReadonlySet<number> = new Set();

export function Disassembly() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  const assembleResult = useAppStore((s) => s.assembleResult);
  const source = useAppStore((s) => s.source);
  const breakpointsByFile = useAppStore((s) => s.breakpointsByFile);
  const toggleBreakpointLine = useAppStore((s) => s.toggleBreakpointLine);
  const breakpointLines = breakpointsByFile[MAIN_FILE] ?? EMPTY_SET;
  void generation;

  const entries = useMemo<LineEntry[]>(() => {
    if (!assembleResult) return [];
    const sourceLines = source.split(/\r\n|\r|\n/);
    const byLine = lineAddressMap(assembleResult.sourceMap, MAIN_FILE);
    return Array.from(byLine.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([line, addr]) => ({ addr, line, text: sourceLines[line - 1] ?? '' }));
  }, [assembleResult, source]);

  const currentAddr = emulator?.cpu.pc ?? -1;
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    const current = currentRef.current;
    if (!container || !current) return;
    // Adjust only this list's own scrollTop — never Element.scrollIntoView(),
    // which walks every scrollable ancestor (including the whole dashboard's
    // outer scroll container) and was yanking the entire page around on
    // every single-stepped instruction while running.
    const containerRect = container.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    const relTop = currentRect.top - containerRect.top + container.scrollTop;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (relTop < viewTop || relTop + currentRect.height > viewBottom) {
      container.scrollTop = relTop - container.clientHeight / 2 + currentRect.height / 2;
    }
    // Only scroll on generation changes tied to execution, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAddr, generation]);

  if (!assembleResult) return <Panel title="Disassembly">No program loaded.</Panel>;

  return (
    <Panel title="Disassembly">
      <div className="disasm-list" ref={listRef}>
        {entries.map((e) => {
          const isCurrent = e.addr === currentAddr;
          const hasBp = breakpointLines.has(e.line);
          return (
            <div
              key={e.addr}
              ref={isCurrent ? currentRef : undefined}
              className={`disasm-row ${isCurrent ? 'current' : ''}`}
            >
              <button
                className={`bp-dot ${hasBp ? 'active' : ''}`}
                title="Toggle breakpoint"
                onClick={() => toggleBreakpointLine(MAIN_FILE, e.line)}
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
