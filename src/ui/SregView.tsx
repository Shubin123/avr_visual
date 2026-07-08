import { useAppStore } from '../state/store';
import { Panel } from './RegisterTable';

const FLAGS = [
  { bit: 7, name: 'I', desc: 'Global Interrupt Enable' },
  { bit: 6, name: 'T', desc: 'Bit Copy Storage' },
  { bit: 5, name: 'H', desc: 'Half Carry' },
  { bit: 4, name: 'S', desc: 'Sign (N xor V)' },
  { bit: 3, name: 'V', desc: 'Two’s Complement Overflow' },
  { bit: 2, name: 'N', desc: 'Negative' },
  { bit: 1, name: 'Z', desc: 'Zero' },
  { bit: 0, name: 'C', desc: 'Carry' },
];

export function SregView() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  void generation;

  if (!emulator) return <Panel title="SREG">No program loaded.</Panel>;
  const sreg = emulator.cpu.SREG;

  return (
    <Panel title="SREG">
      <div className="sreg-row">
        {FLAGS.map((f) => {
          const set = (sreg & (1 << f.bit)) !== 0;
          return (
            <div key={f.name} className={`sreg-flag ${set ? 'set' : ''}`} title={f.desc}>
              <div className="sreg-flag-name">{f.name}</div>
              <div className="sreg-flag-value">{set ? 1 : 0}</div>
            </div>
          );
        })}
      </div>
      <div className="sp-row">
        <span>SP = 0x{emulator.cpu.SP.toString(16).padStart(4, '0')}</span>
        <span>PC = 0x{emulator.cpu.pc.toString(16).padStart(4, '0')}</span>
        <span>Instructions: {emulator.instructionsRetired}</span>
      </div>
    </Panel>
  );
}
