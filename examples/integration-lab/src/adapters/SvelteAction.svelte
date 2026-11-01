<script>
  import { glorpie } from 'glorpies/svelte';
  let { initial, report } = $props();
  // Only the initial value is captured; the harness calls update for subsequent props.
  // svelte-ignore state_referenced_locally
  let options = $state(initial);
  export function update(next) { options = next; }
  const length = (value) => typeof value === 'number' ? `${value}px` : value;
</script>

<canvas use:glorpie={{ ...options, onError: report }} class={options.className} aria-label={options.label} style:width={length(options.size)} style:height={length(options.size)}></canvas>
