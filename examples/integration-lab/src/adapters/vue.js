import { createApp, h, reactive } from 'vue';
import { Glorpie } from 'glorpies/vue';
export function start(stage, options, error) {
  const props = reactive({ ...options, onError: error });
  const app = createApp(() => h(Glorpie, props));
  app.mount(stage);
  return { update: (next) => Object.assign(props, next), destroy: () => app.unmount() };
}
