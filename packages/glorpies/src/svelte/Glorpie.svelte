<script>
  import { attributesOf, defineGlorpie, hostStyle, styleText } from './action.js';

  defineGlorpie();

  export let name;
  export let look = undefined;
  export let size = 48;
  export let shape = undefined;
  export let state = undefined;
  export let background = true;
  export let alive = undefined;
  export let pokeable = false;
  export let label = undefined;
  export let priority = undefined;
  export let onError = undefined;
  let className = undefined;
  export { className as class };

  $: options = { name, look, size, shape, state, background, alive, pokeable, label, priority };

  function failed(event) {
    if (!onError) return;
    event.preventDefault();
    onError(event.detail);
  }
</script>

<glorpie-face
  {...attributesOf(options)}
  class={className}
  style={styleText(hostStyle(options))}
  on:glorpie-error={failed}
></glorpie-face>
