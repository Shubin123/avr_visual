// @wokwi/elements ships JSX typings for the old global `JSX` namespace
// convention; this project's @types/react (19.x) moved intrinsic element
// resolution to `React.JSX` with no bridge, so those shipped types don't
// merge here. This is a minimal replacement covering only the elements we
// actually use — see node_modules/@wokwi/elements/dist/esm/react-types.d.ts
// for the full (currently non-functional, for us) set.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type WokwiEl<Props> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Props;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'wokwi-led': WokwiEl<{
        value?: boolean;
        color?: string;
        brightness?: number;
        label?: string;
        flip?: boolean;
      }>;
      'wokwi-lcd1602': WokwiEl<{
        characters?: Uint8Array | number[];
        cursor?: boolean;
        blink?: boolean;
        cursorX?: number;
        cursorY?: number;
        backlight?: boolean;
        color?: string;
        background?: string;
      }>;
      'wokwi-pushbutton': WokwiEl<{
        color?: string;
        pressed?: boolean;
        label?: string;
      }>;
      'wokwi-arduino-mega': WokwiEl<{
        led13?: boolean;
        ledRX?: boolean;
        ledTX?: boolean;
        ledPower?: boolean;
      }>;
    }
  }
}
