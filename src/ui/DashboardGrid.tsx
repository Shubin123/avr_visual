import ReactGridLayout, { useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Editor } from './Editor';
import { ErrorsPanel } from './ErrorsPanel';
import { RegisterTable } from './RegisterTable';
import { Panel } from './RegisterTable';
import { SregView } from './SregView';
import { StackView } from './StackView';
import { MemoryMap } from './MemoryMap';
import { Disassembly } from './Disassembly';
import { HardwarePanel } from './HardwarePanel';

const STORAGE_KEY = 'mega-visualizer-layout-v1';
const COLS = 12;
const ROW_HEIGHT = 28;

const DEFAULT_LAYOUT: Layout = [
  { i: 'code', x: 0, y: 0, w: 5, h: 18, minW: 3, minH: 6 },
  { i: 'sreg', x: 5, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'registers', x: 5, y: 3, w: 3, h: 9, minW: 2, minH: 3 },
  { i: 'stack', x: 5, y: 12, w: 3, h: 6, minW: 2, minH: 3 },
  { i: 'disasm', x: 8, y: 0, w: 2, h: 10, minW: 2, minH: 3 },
  { i: 'memory', x: 8, y: 10, w: 2, h: 8, minW: 2, minH: 3 },
  { i: 'board', x: 10, y: 0, w: 2, h: 18, minW: 2, minH: 6 },
];

function loadLayout(): Layout {
  let stored: LayoutItem[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = [];
  }
  // Keep only widgets that still exist, and fill in any new ones (from an
  // app update) with their defaults, so a stale saved layout never hides a
  // widget or crashes on a missing key.
  const byId = new Map(stored.map((item) => [item.i, item]));
  return DEFAULT_LAYOUT.map((def) => byId.get(def.i) ?? def);
}

export function DashboardGrid() {
  const { width, containerRef, mounted } = useContainerWidth();

  return (
    <div className="dashboard-scroll">
      <ErrorsPanel />
      <div className="dashboard-grid-container" ref={containerRef}>
        {mounted && (
          <ReactGridLayout
            width={width}
            layout={loadLayout()}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [10, 10] }}
            dragConfig={{ handle: '.panel-title' }}
            onLayoutChange={(layout) => {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
            }}
          >
            <div key="code" className="grid-widget">
              <Panel title="Code">
                <Editor />
              </Panel>
            </div>
            <div key="sreg" className="grid-widget">
              <SregView />
            </div>
            <div key="registers" className="grid-widget">
              <RegisterTable />
            </div>
            <div key="stack" className="grid-widget">
              <StackView />
            </div>
            <div key="disasm" className="grid-widget">
              <Disassembly />
            </div>
            <div key="memory" className="grid-widget">
              <MemoryMap />
            </div>
            <div key="board" className="grid-widget">
              <HardwarePanel />
            </div>
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
