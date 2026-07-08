import { EXAMPLES, useAppStore } from '../state/store';

export function Toolbar() {
  const loadExample = useAppStore((s) => s.loadExample);
  const assembleAndLoad = useAppStore((s) => s.assembleAndLoad);
  const step = useAppStore((s) => s.step);
  const stepOver = useAppStore((s) => s.stepOver);
  const play = useAppStore((s) => s.play);
  const pause = useAppStore((s) => s.pause);
  const reset = useAppStore((s) => s.reset);
  const running = useAppStore((s) => s.running);
  const emulator = useAppStore((s) => s.emulator);
  const statusMessage = useAppStore((s) => s.statusMessage);
  const instructionsPerFrame = useAppStore((s) => s.instructionsPerFrame);
  const setSpeed = useAppStore((s) => s.setSpeed);

  return (
    <div className="toolbar">
      <label className="speed-label">
        Example
        <select defaultValue="" onChange={(e) => e.target.value && loadExample(e.target.value)}>
          <option value="" disabled>
            Load…
          </option>
          {Object.keys(EXAMPLES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary" onClick={assembleAndLoad}>
        Assemble
      </button>
      <button className="btn" onClick={play} disabled={!emulator || running}>
        ▶ Run
      </button>
      <button className="btn" onClick={pause} disabled={!running}>
        ⏸ Pause
      </button>
      <button className="btn" onClick={step} disabled={!emulator || running}>
        Step
      </button>
      <button className="btn" onClick={stepOver} disabled={!emulator || running}>
        Step Over
      </button>
      <button className="btn" onClick={reset} disabled={!emulator}>
        Reset
      </button>
      <label className="speed-label">
        Speed
        <select
          value={instructionsPerFrame}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value={50}>Slow</option>
          <option value={2000}>Normal</option>
          <option value={50000}>Fast</option>
          <option value={500000}>Turbo</option>
        </select>
      </label>
      <div className="status-message">{statusMessage}</div>
    </div>
  );
}
