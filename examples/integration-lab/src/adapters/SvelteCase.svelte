<script>
  import { Glorpie } from 'glorpies/svelte';
  let { initial, report } = $props();
  // The harness supplies later props through update().
  // svelte-ignore state_referenced_locally
  let options = $state(initial);
  export function update(next) { options = next; }
</script>

<Glorpie {...options} class={options.className} onError={report} />
