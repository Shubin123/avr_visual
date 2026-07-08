import { useAppStore } from '../state/store';

export function RegisterTable() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  void generation;

  if (!emulator) {
    return <Panel title="Registers">No program loaded.</Panel>;
  }

  const regs = emulator.cpu.data.subarray(0, 32);
  return (
    <Panel title="Registers R0-R31">
      <div className="reg-grid">
        {Array.from(regs).map((v, i) => (
          <div className="reg-cell" key={i} title={`r${i} = ${v} (0b${v.toString(2).padStart(8, '0')})`}>
            <span className="reg-name">r{i}</span>
            <span className="reg-value">{hex2(v)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function hex2(v: number): string {
  return `0x${(v & 0xff).toString(16).padStart(2, '0')}`;
}

export function hex4(v: number): string {
  return `0x${(v & 0xffff).toString(16).padStart(4, '0')}`;
}
