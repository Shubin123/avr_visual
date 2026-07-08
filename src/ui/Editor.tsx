import { useEffect, useRef } from 'react';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  gutter,
  GutterMarker,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { MAIN_FILE, useAppStore } from '../state/store';

const EMPTY_LINES: ReadonlySet<number> = new Set();

class BreakpointDotMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement('div');
    dot.className = 'cm-breakpoint-dot';
    return dot;
  }
}
const breakpointDot = new BreakpointDotMarker();

/** Click-to-toggle breakpoint gutter. Reads/writes through the callbacks (not
 *  CodeMirror state) so it stays in sync with the zustand store, which is the
 *  single source of truth the emulator/Disassembly panel also read from. */
function breakpointGutter(getLines: () => ReadonlySet<number>, onToggle: (line: number) => void) {
  return gutter({
    class: 'cm-breakpoint-gutter',
    // CodeMirror skips rendering a DOM element for lines with no marker by
    // default, which would make most of the gutter unclickable — every line
    // needs a (possibly empty) element so the whole column is click-to-toggle.
    renderEmptyElements: true,
    markers(view) {
      const lines = getLines();
      const builder = new RangeSetBuilder<GutterMarker>();
      if (lines.size > 0) {
        for (let i = 1; i <= view.state.doc.lines; i++) {
          if (lines.has(i)) builder.add(view.state.doc.line(i).from, view.state.doc.line(i).from, breakpointDot);
        }
      }
      return builder.finish();
    },
    domEventHandlers: {
      mousedown(view, block) {
        onToggle(view.state.doc.lineAt(block.from).number);
        return true;
      },
    },
  });
}

const MNEMONICS = new Set([
  'adc','add','adiw','and','andi','asr','bclr','bld','brbc','brbs','brcc','brcs','break','breq','brge','brhc','brhs',
  'brid','brie','brlo','brlt','brmi','brne','brpl','brsh','brtc','brts','brvc','brvs','bset','bst','call','cbi','cbr',
  'clc','clh','cli','cln','clr','cls','clt','clv','clz','com','cp','cpc','cpi','cpse','dec','des','eicall','eijmp',
  'elpm','eor','fmul','fmuls','fmulsu','icall','ijmp','in','inc','jmp','lac','las','lat','ld','ldd','ldi','lds','lpm',
  'lsl','lsr','mov','movw','mul','muls','mulsu','neg','nop','or','ori','out','pop','push','rcall','ret','reti','rjmp',
  'rol','ror','sbc','sbci','sbi','sbic','sbis','sbiw','sbr','sbrc','sbrs','sec','seh','sei','sen','ser','ses','set',
  'sev','sez','sleep','spm','st','std','sts','sub','subi','swap','tst','wdr','xch',
]);

const DIRECTIVES = new Set([
  '.cseg','.dseg','.eseg','.org','.equ','.set','.def','.undef','.db','.dw','.byte','.include','.macro','.endmacro',
  '.endm','.if','.else','.elif','.endif','.error','.warning','.device','.list','.nolist','.listmac','.exit',
]);

function avrAsmTokenizer(stream: { match: (r: RegExp) => RegExpMatchArray | null; eatSpace: () => boolean; skipToEnd: () => void; string: string; pos: number }) {
  if (stream.eatSpace()) return null;
  if (stream.match(/^;.*/)) return 'comment';
  if (stream.match(/^#.*/)) return 'meta';
  if (stream.match(/^"([^"\\]|\\.)*"/)) return 'string';
  if (stream.match(/^'([^'\\]|\\.)'/)) return 'string';
  if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number';
  if (stream.match(/^0[bB][01]+/)) return 'number';
  if (stream.match(/^\d+\.\d+([eE][+-]?\d+)?/)) return 'number';
  if (stream.match(/^\d+/)) return 'number';
  if (stream.match(/^\.[a-zA-Z]+/)) {
    return DIRECTIVES.has(stream.string.slice(0, stream.pos).split(/\s/).pop()!.toLowerCase()) ? 'keyword' : 'keyword';
  }
  if (stream.match(/^[rR]\d{1,2}\b/)) return 'atom';
  const wordMatch = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if (wordMatch) {
    const word = wordMatch[0].toLowerCase();
    if (MNEMONICS.has(word)) return 'keyword';
    return 'variableName';
  }
  if (stream.match(/^:/)) return null;
  stream.match(/^./);
  return null;
}

const avrAsmLanguage = StreamLanguage.define({
  token: avrAsmTokenizer as never,
});

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setActiveFileContent = useAppStore((s) => s.setActiveFileContent);
  const toggleBreakpointLine = useAppStore((s) => s.toggleBreakpointLine);
  const source = useAppStore((s) => s.source);
  const projectFiles = useAppStore((s) => s.projectFiles);
  const activeFile = useAppStore((s) => s.activeFile);
  const breakpointsByFile = useAppStore((s) => s.breakpointsByFile);

  const fileKey = activeFile ?? MAIN_FILE;
  const content = activeFile === null ? source : (projectFiles[activeFile] ?? '');
  const breakpointLines = breakpointsByFile[fileKey] ?? EMPTY_LINES;

  const lastKnownDoc = useRef(content);
  // The gutter/updateListener extensions are created once and close over
  // these refs (not the props above) so toggling a breakpoint or typing
  // always acts on whichever file is *currently* active, not whichever was
  // active when the CodeMirror instance was first created.
  const fileKeyRef = useRef(fileKey);
  const breakpointLinesRef = useRef(breakpointLines);
  fileKeyRef.current = fileKey;
  breakpointLinesRef.current = breakpointLines;

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: lastKnownDoc.current,
      extensions: [
        lineNumbers(),
        breakpointGutter(
          () => breakpointLinesRef.current,
          (line) => toggleBreakpointLine(fileKeyRef.current, line),
        ),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        avrAsmLanguage,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            lastKnownDoc.current = text;
            setActiveFileContent(text);
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'auto' },
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync the doc when the active file's content changes from outside this
  // view itself — the user typing elsewhere is impossible (single editor),
  // but switching files, loading an example, or an external reset all land here.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || content === lastKnownDoc.current) return;
    lastKnownDoc.current = content;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
  }, [content]);

  // Force the breakpoint gutter to redraw when breakpoints change from
  // elsewhere (the Disassembly panel) or when switching to a different file.
  useEffect(() => {
    viewRef.current?.dispatch({});
  }, [breakpointLines, fileKey]);

  return <div className="editor-container" ref={containerRef} />;
}
