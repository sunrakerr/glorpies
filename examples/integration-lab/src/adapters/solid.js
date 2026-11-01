import { createSignal, createComponent } from 'solid-js';
import { render } from 'solid-js/web';
import { Glorpie } from 'glorpies/solid';
export function start(stage, options, error) {
  const [props, setProps] = createSignal(options);
  const values = {};
  for (const key of Object.keys(options)) Object.defineProperty(values, key, { enumerable: true, get: () => props()[key] });
  Object.defineProperty(values, 'class', { enumerable: true, get: () => props().className });
  values.onError = error;
  const dispose = render(() => createComponent(Glorpie, values), stage);
  return { update: setProps, destroy: dispose };
}
