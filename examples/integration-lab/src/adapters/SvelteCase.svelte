<script>
  import { Glorpie } from 'glorpies/svelte';
  let { initial, report } = $props();
  let options = $state(initial);
  export function update(next) { options = next; }
</script>

<Glorpie {...options} class={options.className} onError={report} />
