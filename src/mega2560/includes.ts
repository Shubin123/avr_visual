// Bundled .include files so `.include "m2560def.inc"` (and the multi-file
// examples/lcd/ driver) work without the user having to upload anything,
// exactly like they do in Microchip Studio when the referenced files sit
// next to the including .asm file.
import m2560defText from './m2560def.inc?raw';
import lcdAsmText from '../../examples/lcd/lcd.asm?raw';
import lcdDefsText from '../../examples/lcd/LCDdefs.inc?raw';

const BUNDLED: Record<string, string> = {
  'm2560def.inc': m2560defText,
  'lcd.asm': lcdAsmText,
  'lcddefs.inc': lcdDefsText,
};

export function resolveBundledInclude(filename: string): string | null {
  const base = filename.trim().toLowerCase().replace(/^["']|["']$/g, '');
  return BUNDLED[base] ?? null;
}
