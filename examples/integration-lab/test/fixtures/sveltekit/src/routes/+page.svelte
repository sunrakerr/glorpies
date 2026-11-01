<script>
import { Glorpie } from 'glorpies/svelte';
let name = $state(42);
</script>
<h1>SvelteKit published package</h1><Glorpie {name} size={96} look="ink" alive={false} label="SSR specimen" /><button onclick={() => name = '42'}>String seed</button>
