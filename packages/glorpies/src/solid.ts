import { createComponent, Dynamic } from 'solid-js/web';
import type { JSX } from 'solid-js';
import { defineGlorpie } from './element-core';
import { attributesOf, hostStyle, type GlorpieOptions } from './host';

// called here, not left to an import: bundlers may drop an import that only has side effects
defineGlorpie();

export type GlorpieProps = GlorpieOptions & {
  /** Called if the face can't be painted; without it the error is logged. */
  onError?: (error: unknown) => void;
  class?: string;
};

const ATTRIBUTES = [
  'name',
  'data-seed',
  'look',
  'size',
  'shape',
  'state',
  'background',
  'alive',
  'pokeable',
  'label',
  'priority',
] as const;

/** A living face for Solid: `<Glorpie name="ada@lovelace.dev" size={40} />`. */
export function Glorpie(props: GlorpieProps): JSX.Element {
  // getters keep every attribute reactive to the props it comes from
  const element: Record<string, unknown> = {
    component: 'glorpie-face',
    get class() {
      return props.class;
    },
    get style() {
      return hostStyle(props);
    },
    'on:glorpie-error': (event: CustomEvent) => {
      if (!props.onError) return;
      event.preventDefault();
      props.onError(event.detail);
    },
  };
  for (const key of ATTRIBUTES)
    Object.defineProperty(element, key, { enumerable: true, get: () => attributesOf(props)[key] });
  return createComponent(Dynamic, element as Parameters<typeof Dynamic>[0]);
}
