import { PinState } from 'avr8js';
import '@wokwi/elements';
import { useAppStore } from '../state/store';
import { Panel } from './RegisterTable';
import type { LcdKeypadButton } from '../emulator/emulator';

// The six-LED module from examples/a2-signaling.asm: leftmost->rightmost maps
// to PORTL7, PORTL5, PORTL3, PORTL1, PORTB3, PORTB1 (see set_leds in that file).
const LEDS: { port: string; bit: number; label: string }[] = [
  { port: 'L', bit: 7, label: '01' },
  { port: 'L', bit: 5, label: '02' },
  { port: 'L', bit: 3, label: '03' },
  { port: 'B', bit: 3, label: '04' },
  { port: 'L', bit: 1, label: '05' },
  { port: 'B', bit: 1, label: '06' },
];

const BUTTONS: { key: LcdKeypadButton; label: string }[] = [
  { key: 'left', label: '◀' },
  { key: 'up', label: '▲' },
  { key: 'down', label: '▼' },
  { key: 'right', label: '▶' },
  { key: 'select', label: 'SEL' },
];

export function HardwarePanel() {
  const generation = useAppStore((s) => s.generation);
  const emulator = useAppStore((s) => s.emulator);
  const lcdState = useAppStore((s) => s.lcdState);
  const activeButton = useAppStore((s) => s.activeButton);
  const setButton = useAppStore((s) => s.setButton);
  void generation;

  return (
    <Panel title="Board">
      <div className="hw-panel">
        <div className="hw-leds">
          {LEDS.map((led) => {
            const on = emulator ? emulator.ports[led.port]?.pinState(led.bit) === PinState.High : false;
            return (
              <div className="hw-led-slot" key={`${led.port}${led.bit}`}>
                <wokwi-led value={on} color="red" label={led.label} />
              </div>
            );
          })}
        </div>

        <div className="hw-lcd">
          <wokwi-lcd1602
            characters={lcdState.characters}
            cursor={lcdState.cursor}
            blink={lcdState.blink}
            cursorX={lcdState.cursorX}
            cursorY={lcdState.cursorY}
            backlight={true}
          />
        </div>

        <div className="hw-buttons">
          {BUTTONS.map((b) => (
            <wokwi-pushbutton
              key={b.key}
              label={b.label}
              pressed={activeButton === b.key}
              onPointerDown={() => setButton(b.key)}
              onPointerUp={() => setButton('none')}
              onPointerLeave={() => activeButton === b.key && setButton('none')}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}
