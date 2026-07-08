import { useMemo, useState } from 'react';
import { useAppStore } from '../state/store';
import { Panel, hex2 } from './RegisterTable';
import { REGISTER_NAME_BY_ADDRESS } from '../mega2560/register-names.generated';
import { RAMEND, SRAM_START } from '../mega2560/device';

type Region = 'regs' | 'io' | 'extio' | 'sram';

const REGIONS: { key: Region; label: string; start: number; end: number }[] = [
  { key: 'regs', label: 'R0-R31', start: 0x00, end: 0x1f },
  { key: 'io', label: 'I/O (0x20-0x5F)', start: 0x20, end: 0x5f },
  { key: 'extio', label: 'Ext I/O (0x60-0x1FF)', start: 0x60, end: 0x1ff },
  { key: 'sram', label: `SRAM (0x${SRAM_START.toString(16)}-0x${RAMEND.toString(16)})`, start: SRAM_START, end: RAMEND },
];

const ROW_WIDTH = 8;

export function MemoryMap() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  void generation;
  const [region, setRegion] = useState<Region>('io');

  const { start, end } = REGIONS.find((r) => r.key === region)!;

  const rows = useMemo(() => {
    const out: { base: number; addrs: number[] }[] = [];
    for (let base = start - (start % ROW_WIDTH); base <= end; base += ROW_WIDTH) {
      out.push({ base, addrs: Array.from({ length: ROW_WIDTH }, (_, i) => base + i) });
    }
    return out;
  }, [start, end]);

  if (!emulator) return <Panel title="Memory">No program loaded.</Panel>;
  const data = emulator.cpu.data;

  return (
    <Panel title="Memory Map">
      <div className="mem-region-tabs">
        {REGIONS.map((r) => (
          <button
            key={r.key}
            className={`tab-btn ${region === r.key ? 'active' : ''}`}
            onClick={() => setRegion(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mem-dump">
        {rows.map(({ base, addrs }) => (
          <div className="mem-row" key={base}>
            <span className="mem-addr mono dim">0x{base.toString(16).padStart(4, '0')}</span>
            {addrs.map((addr) => {
              if (addr < start || addr > end || addr >= data.length) {
                return <span className="mem-byte mono dim" key={addr}>--</span>;
              }
              const name = REGISTER_NAME_BY_ADDRESS[addr];
              return (
                <span className="mem-byte mono" key={addr} title={name ? `${name} (0x${addr.toString(16)})` : `0x${addr.toString(16)}`}>
                  {hex2(data[addr]).slice(2)}
                </span>
              );
            })}
            <span className="mem-names">
              {addrs
                .map((a) => REGISTER_NAME_BY_ADDRESS[a])
                .filter(Boolean)
                .join(' ')}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
