import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
export default defineConfig({ ssr: { external: ['@napi-rs/canvas'] }, plugins: [sveltekit({ adapter: adapter() })] });
