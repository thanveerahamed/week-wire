import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin trace root to the monorepo root so deploys bundle workspace deps correctly.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    // Allow importing TS source from the shared workspace package.
    externalDir: true,
  },
  transpilePackages: ['@week-wire/shared'],
  // Firebase Admin and googleapis are server-only — keep them out of the client bundle.
  serverExternalPackages: ['firebase-admin', 'googleapis'],
  // The shared package uses NodeNext-style `.js` import suffixes that point at
  // `.ts` source. Webpack needs to be told how to follow them.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    // Explicit alias so @/ resolves correctly in all build environments
    // (e.g. Firebase App Hosting) where tsconfig path inference may not run.
    config.resolve.alias = {
      ...(typeof config.resolve.alias === 'object' && !Array.isArray(config.resolve.alias)
        ? config.resolve.alias
        : {}),
      '@': path.resolve(__dirname, 'src'),
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
