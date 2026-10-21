import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this app directory. Without this,
  // Turbopack infers the root from the nearest ancestor lockfile and can pick
  // C:\Users\Prekzursil (a stray home-dir package-lock.json exists), which
  // pollutes build traces and dev file-watching. npm scripts always run with
  // cwd = frontend/web, so process.cwd() resolves to this directory.
  turbopack: {
    // TURBO_ROOT_OVERRIDE lets disposable worktrees (whose node_modules is a
    // junction into the main checkout) widen the hermetic root for local
    // builds only. Unset (CI, normal dev) the root stays this directory.
    root: process.env.TURBO_ROOT_OVERRIDE || process.cwd(),
  },

  webpack(config, { dev }) {
if (dev) {
    config.module.rules.push({
      test: /\.(jsx|tsx)$/,
      exclude: [/node_modules/],
      use: [{
        loader: '@dhiwise/component-tagger/nextLoader',
      }],
    });
  }

    return config;
  }
};

export default nextConfig;
