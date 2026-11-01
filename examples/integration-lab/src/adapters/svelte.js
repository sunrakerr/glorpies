import { mount, unmount } from 'svelte';
import SvelteCase from './SvelteCase.svelte';
import SvelteAction from './SvelteAction.svelte';
export function start(stage, options, error, kind) {
  const instance = mount(kind === 'svelte-action' ? SvelteAction : SvelteCase, { target: stage, props: { initial: options, report: error } });
  return { update: (next) => instance.update(next), destroy: () => unmount(instance) };
}
