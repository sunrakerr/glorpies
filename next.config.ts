import createMDX from '@next/mdx';
import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // the library ships TypeScript source inside the workspace
  transpilePackages: ['glorpies'],
};

// plugins are named, not imported, so Turbopack can load them
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: [fileURLToPath(new URL('./src/lib/rehype-code-meta.mjs', import.meta.url))],
  },
});

export default withMDX(nextConfig);
