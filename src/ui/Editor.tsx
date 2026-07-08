import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { useAppStore } from '../state/store';

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
  const setSource = useAppStore((s) => s.setSource);
  const source = useAppStore((s) => s.source);
  const lastKnownDoc = useRef(source);

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: lastKnownDoc.current,
      extensions: [
        lineNumbers(),
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
            setSource(text);
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

  // Re-sync the doc when the store's source changes from outside the editor
  // itself (e.g. loading an example) rather than from the user typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || source === lastKnownDoc.current) return;
    lastKnownDoc.current = source;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  }, [source]);

  return <div className="editor-container" ref={containerRef} />;
}
