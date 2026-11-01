<script setup>
import { ref } from 'vue';
import { Glorpie } from 'glorpies/vue';
const name = ref(42);
</script>
<template><main><h1>Nuxt published package</h1><Glorpie :name="name" :size="96" look="ink" :alive="false" label="SSR specimen" /><button @click="name = '42'">String seed</button></main></template>
