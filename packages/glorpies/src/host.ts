import type { LookChoice } from './looks';
import type { FaceName } from './seed';
import type { FaceState } from './states';
import { backdropOf, faceColors, type Shape } from './still';

/** What every framework's `<Glorpie>` takes. */
export type GlorpieOptions = {
  /** Any string or seed; the same name is always the same face. */
  name: FaceName;
  /** A look id, or `auto`: watercolour when large, the ink badge below 72px. */
  look?: LookChoice;
  /** Pixels, or any CSS length. Defaults to 48. */
  size?: number | string;
  /** The crop. Ignored with `background={false}`. */
  shape?: Shape;
  state?: FaceState;
  /**
   * `true` (the default) paints the face on its own paper. `false` shows only the face: no backdrop,
   * no pencil lines, no crop. Any CSS colour puts the face on that colour instead, cropped to its shape.
   */
  background?: boolean | string;
  /** Breathing, blinking and glancing. Defaults to on, unless the reader prefers reduced motion. */
  alive?: boolean;
  /** Tapping makes the face wobble. */
  pokeable?: boolean;
  /** Accessible name. Defaults to "Avatar". */
  label?: string;
  /** Higher paints sooner when many faces are waiting. */
  priority?: number;
};

export const RADIUS: Record<Shape, string> = { circle: '50%', squircle: '30%', rounded: '16%', square: '0' };

export const cssLength = (size: number | string) => (typeof size === 'number' ? `${size}px` : size);

/** The `<glorpie-face>` attributes for a set of options; an attribute left out is the default. */
export function attributesOf(o: GlorpieOptions): Record<string, string | number> {
  const attrs: Record<string, string | number> = { name: o.name, size: String(o.size ?? 48) };
  // HTML attributes lose numeric identity. Keep it explicit through SSR and hydration.
  if (typeof o.name === 'number') attrs['data-seed'] = String(o.name);
  if (o.look) attrs.look = o.look;
  if (o.shape) attrs.shape = o.shape;
  if (o.state) attrs.state = o.state;
  if (o.background === false) attrs.background = 'false';
  else if (typeof o.background === 'string') attrs.background = o.background;
  if (o.alive !== undefined) attrs.alive = String(o.alive);
  if (o.pokeable) attrs.pokeable = '';
  if (o.label) attrs.label = o.label;
  if (o.priority !== undefined) attrs.priority = String(o.priority);
  return attrs;
}

/** The face's size, crop and colour as inline style, so it holds its place before the element upgrades or the page hydrates. */
export function hostStyle(o: GlorpieOptions): Record<string, string> {
  const size = cssLength(o.size ?? 48);
  const { paper, colour } = backdropOf(o.background);
  return {
    display: 'inline-block',
    'vertical-align': 'middle',
    width: size,
    height: size,
    'border-radius': paper || colour ? RADIUS[o.shape ?? 'circle'] : '0',
    background: colour ?? (paper ? faceColors(o.name).bg : 'none'),
  };
}

export const styleText = (style: Record<string, string>) => Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
