import { h, type JSX } from 'preact';
import { defineGlorpie } from './element-core';
import { attributesOf, hostStyle, type GlorpieOptions } from './host';

// called here, not left to an import: bundlers may drop an import that only has side effects
defineGlorpie();

export type GlorpieProps = GlorpieOptions & {
  /** Called if the face can't be painted; without it the error is logged. */
  onError?: (error: unknown) => void;
  class?: string;
};

/** A living face for Preact: `<Glorpie name="ada@lovelace.dev" size={40} />`. */
export function Glorpie({ onError, class: className, ...options }: GlorpieProps): JSX.Element {
  return h('glorpie-face', {
    ...attributesOf(options),
    class: className,
    style: hostStyle(options),
    'onglorpie-error': onError
      ? (event: CustomEvent) => {
          event.preventDefault();
          onError(event.detail);
        }
      : undefined,
  });
}
