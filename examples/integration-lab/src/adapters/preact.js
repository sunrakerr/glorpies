import { h, render } from 'preact';
import { Glorpie } from 'glorpies/preact';
export function start(stage, options, error) {
  const update = (props) => render(h(Glorpie, { ...props, class: props.className, onError: error }), stage);
  update(options);
  return { update, destroy: () => render(null, stage) };
}
