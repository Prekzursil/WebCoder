import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this app directory. Without this,
  // Turbopack infers the root from the nearest ancestor lockfile and can pick
  // C:\Users\Prekzursil (a stray home-dir package-lock.json exists), which
  // pollutes build traces and dev file-watching. npm scripts always run with
  // cwd = frontend/web, so process.cwd() resolves to this directory.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
