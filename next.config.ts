import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // the library ships TypeScript source inside the workspace
  transpilePackages: ['glorpies'],
  // a native module, loaded by Node at run time rather than bundled
  serverExternalPackages: ['@napi-rs/canvas'],
};

// plugins are named, not imported, so Turbopack can load them
export default createMDX({ options: { remarkPlugins: ['remark-gfm'] } })(nextConfig);
