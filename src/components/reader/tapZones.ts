/**
 * InkTrick - Reader tap zones (shared by the comic and PDF readers)
 *
 *  ┌──────────────────────────┐  top band (MENU_BAND): opens the controls
 *  │██████████████████████████│
 *  │▓▓                      ▓▓│  narrow edge strips: turn pages
 *  │▓▓        (page)        ▓▓│  everything else does nothing, so casual
 *  │▓▓                      ▓▓│  touches never flip a page by accident
 *  │                          │
 *  └──────────────────────────┘
 */

/** Height of the top band that opens the controls, as a fraction of the screen height. */
export const MENU_BAND = 0.095;

const EDGE_WIDTH = 0.17;
const EDGE_TOP = 0.12;
const EDGE_BOTTOM = 0.9;

export type TurnSide = 'left' | 'right' | null;

/** Which edge strip (if any) a tap at (x, y) falls in. Coordinates in dp. */
export function turnSideAt(x: number, y: number, width: number, height: number): TurnSide {
  if (y < height * EDGE_TOP || y > height * EDGE_BOTTOM) return null;
  if (x <= width * EDGE_WIDTH) return 'left';
  if (x >= width * (1 - EDGE_WIDTH)) return 'right';
  return null;
}
