import { defineGlorpie } from '../element';
import { mount, type MountOptions } from '../mount';

export { attributesOf, hostStyle, styleText } from '../host';

defineGlorpie();

/** A living face on a canvas of your own: `<canvas use:glorpie={{ name: user.email }} />`, sized with CSS. */
export function glorpie(canvas: HTMLCanvasElement, options: MountOptions) {
  const face = mount(canvas, options);
  return {
    update: (next: MountOptions) => face.update(next),
    destroy: () => face.destroy(),
  };
}
