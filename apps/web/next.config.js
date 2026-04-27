/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pulse/ui", "@pulse/sources", "@pulse/charts", "@pulse/i18n"],
  typedRoutes: false,
  // `@pulse/sources` mixes server-only adapters (farside, portfolio) and pure
  // utilities (format, types) in one barrel. Mark Node built-ins as `false` on
  // the client bundle so their lazy `await import("node:*")` calls don't crash
  // webpack's static analysis. Server-side rendering still has full access.
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        "node:child_process": false,
        "node:util": false,
        "node:crypto": false,
        "node:fs": false,
        "node:fs/promises": false,
        "node:path": false,
        "node:os": false,
        child_process: false,
        crypto: false,
        fs: false,
        path: false,
        os: false,
        util: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
