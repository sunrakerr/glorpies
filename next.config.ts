import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the library ships TypeScript source inside the workspace
  transpilePackages: ['glorpies'],
  // a native module, loaded by Node at run time rather than bundled
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
