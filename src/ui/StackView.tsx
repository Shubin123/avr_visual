import { useAppStore } from '../state/store';
import { Panel, hex2 } from './RegisterTable';
import { RAMEND } from '../mega2560/device';

export function StackView() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  void generation;

  if (!emulator) return <Panel title="Stack">No program loaded.</Panel>;

  const sp = emulator.cpu.SP;
  const rows: { addr: number; value: number }[] = [];
  // Show from RAMEND down to SP+1 (bytes actually pushed), most-recent first,
  // capped so a runaway/unset SP doesn't try to render tens of thousands of rows.
  const top = Math.min(RAMEND, sp + 64);
  for (let addr = top; addr > sp; addr--) {
    rows.push({ addr, value: emulator.cpu.data[addr] });
  }

  return (
    <Panel title="Stack">
      <div className="stack-meta">
        SP = 0x{sp.toString(16).padStart(4, '0')} ({RAMEND - sp} byte{RAMEND - sp === 1 ? '' : 's'} used of{' '}
        {RAMEND - 0x200 + 1})
      </div>
      <div className="stack-list">
        {rows.length === 0 && <div className="stack-empty">Stack is empty.</div>}
        {rows.map((r) => (
          <div className="stack-row" key={r.addr}>
            <span className="mono dim">0x{r.addr.toString(16).padStart(4, '0')}</span>
            <span className="mono">{hex2(r.value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
