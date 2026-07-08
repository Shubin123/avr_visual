import { useState } from 'react';
import { MAIN_FILE, useAppStore } from '../state/store';

export function FileTabs() {
  const projectFiles = useAppStore((s) => s.projectFiles);
  const activeFile = useAppStore((s) => s.activeFile);
  const setActiveFile = useAppStore((s) => s.setActiveFile);
  const addProjectFile = useAppStore((s) => s.addProjectFile);
  const removeProjectFile = useAppStore((s) => s.removeProjectFile);
  const [newName, setNewName] = useState('');

  return (
    <div className="file-tabs">
      <button className={`file-tab ${activeFile === null ? 'active' : ''}`} onClick={() => setActiveFile(null)}>
        {MAIN_FILE}
      </button>
      {Object.keys(projectFiles).map((name) => (
        <span key={name} className={`file-tab-wrap ${activeFile === name ? 'active' : ''}`}>
          <button className="file-tab" onClick={() => setActiveFile(name)}>
            {name}
          </button>
          <button
            className="file-tab-close"
            title={`Remove ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              removeProjectFile(name);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <form
        className="file-tab-add"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = newName.trim();
          if (!trimmed) return;
          addProjectFile(trimmed);
          setNewName('');
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="new file, e.g. mylib.inc"
          title="Add an .inc/.asm file this program can .include"
        />
        <button type="submit" title="Add file">
          +
        </button>
      </form>
    </div>
  );
}
