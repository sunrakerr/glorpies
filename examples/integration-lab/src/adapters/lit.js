import { html, render, nothing } from 'lit';
import 'glorpies/element';

export async function start(stage, options, error) {
  const container = document.createElement('div'); stage.append(container);
  const update = (p) => render(html`<glorpie-face
    .name=${p.name} .look=${p.look} .size=${p.size} .state=${p.state}
    .shape=${p.shape} .background=${p.background} .alive=${p.alive}
    .pokeable=${p.pokeable} .label=${p.label} .priority=${p.priority}
    class=${p.className || ''}
    @glorpie-error=${(event) => { event.preventDefault(); error(event.detail); }}
  ></glorpie-face>`, container);
  update(options);
  return { update, destroy: () => { render(nothing, container); container.remove(); } };
}
