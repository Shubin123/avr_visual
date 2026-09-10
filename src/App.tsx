import { Toolbar } from './ui/Toolbar';
import { DashboardGrid } from './ui/DashboardGrid';

function App() {
  return (
    <div className="app-root">
      <header className="app-header">
        <h1><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="project-mark" width="32" height="32" />Mega Visualizer</h1>
        <span className="app-subtitle">ATmega2560 assembler + visual debugger</span>
      </header>
      <Toolbar />
      <DashboardGrid />
    </div>
  );
}

export default App;
