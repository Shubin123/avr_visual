import { useAppStore } from '../state/store';

export function ErrorsPanel() {
  const assembleResult = useAppStore((s) => s.assembleResult);
  if (!assembleResult || (assembleResult.errors.length === 0 && assembleResult.warnings.length === 0)) {
    return null;
  }
  return (
    <div className="errors-panel">
      {assembleResult.errors.map((e, i) => (
        <div className="error-line" key={`e${i}`}>
          <span className="error-badge">error</span> {e.file}:{e.line}: {e.message}
        </div>
      ))}
      {assembleResult.warnings.map((w, i) => (
        <div className="warning-line" key={`w${i}`}>
          <span className="warning-badge">warning</span> {w.file}:{w.line}: {w.message}
        </div>
      ))}
    </div>
  );
}
