// Bundled .include files so `.include "m2560def.inc"` works without the user
// having to upload anything, exactly like it does in Microchip Studio.
import m2560defText from './m2560def.inc?raw';

const BUNDLED: Record<string, string> = {
  'm2560def.inc': m2560defText,
};

export function resolveBundledInclude(filename: string): string | null {
  const base = filename.trim().toLowerCase().replace(/^["']|["']$/g, '');
  return BUNDLED[base] ?? null;
}
