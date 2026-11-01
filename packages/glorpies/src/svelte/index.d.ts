import { SvelteComponent } from 'svelte';
import type { GlorpieOptions, MountOptions } from '../index.js';

export type GlorpieProps = GlorpieOptions & {
  /** Called if the face can't be painted; without it the error is logged. */
  onError?: (error: unknown) => void;
  class?: string;
};

/** A living face for Svelte: `<Glorpie name="ada@lovelace.dev" size={40} />`. */
export class Glorpie extends SvelteComponent<GlorpieProps> {}

/** A living face on a canvas of your own: `<canvas use:glorpie={{ name: user.email }} />`, sized with CSS. */
export function glorpie(canvas: HTMLCanvasElement, options: MountOptions): { update(next: MountOptions): void; destroy(): void };
