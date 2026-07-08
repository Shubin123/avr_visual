import { Toolbar } from './ui/Toolbar';
import { Editor } from './ui/Editor';
import { ErrorsPanel } from './ui/ErrorsPanel';
import { RegisterTable } from './ui/RegisterTable';
import { SregView } from './ui/SregView';
import { StackView } from './ui/StackView';
import { MemoryMap } from './ui/MemoryMap';
import { Disassembly } from './ui/Disassembly';
import { HardwarePanel } from './ui/HardwarePanel';

function App() {
  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Mega Visualizer</h1>
        <span className="app-subtitle">ATmega2560 assembler + visual debugger</span>
      </header>
      <Toolbar />
      <ErrorsPanel />
      <div className="app-layout">
        <div className="col col-editor">
          <Editor />
        </div>
        <div className="col col-debug">
          <SregView />
          <RegisterTable />
          <StackView />
        </div>
        <div className="col col-mem">
          <Disassembly />
          <MemoryMap />
        </div>
        <div className="col col-hw">
          <HardwarePanel />
        </div>
      </div>
    </div>
  );
}

export default App;
