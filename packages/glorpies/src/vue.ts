import { defineComponent, getCurrentInstance, h, type PropType } from 'vue';
import { defineGlorpie } from './element-core';
import { attributesOf, hostStyle, type GlorpieOptions } from './host';
import type { LookChoice } from './looks';
import type { FaceName } from './seed';
import type { FaceState } from './states';
import type { Shape } from './still';

// called here, not left to an import: bundlers may drop an import that only has side effects
defineGlorpie();

export type { GlorpieOptions as GlorpieProps } from './host';

/** A living face for Vue 3: `<Glorpie name="ada@lovelace.dev" :size="40" />`. Emits `error` if it can't be painted. */
export const Glorpie = defineComponent({
  name: 'Glorpie',
  props: {
    name: { type: [String, Number] as PropType<FaceName>, required: true },
    look: String as PropType<LookChoice>,
    size: { type: [Number, String] as PropType<number | string>, default: 48 },
    shape: String as PropType<Shape>,
    state: String as PropType<FaceState>,
    background: { type: [Boolean, String] as PropType<boolean | string>, default: true },
    alive: { type: Boolean, default: undefined },
    pokeable: Boolean,
    label: String,
    priority: Number,
  },
  emits: { error: (_error: unknown) => true },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    return () => {
      const options = props as GlorpieOptions;
      return h('glorpie-face', {
        ...attributesOf(options),
        style: hostStyle(options),
        onGlorpieError: (event: CustomEvent) => {
          if (!instance?.vnode.props?.onError) return;
          event.preventDefault();
          emit('error', event.detail);
        },
      });
    };
  },
});
