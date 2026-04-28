/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pulse/ui", "@pulse/sources", "@pulse/charts", "@pulse/i18n"],
  typedRoutes: false,
  // better-sqlite3 is a native module — must NOT be webpack-bundled.
  // It is only reached from server-side API routes that use @pulse/sources/server.
  serverExternalPackages: ["better-sqlite3"],
  webpack(config, { isServer }) {
    // The workspace packages ship `"type":"module"` source-only, so internal
    // imports use the NodeNext-required `.js` extension. Tell webpack to map
    // those back to the `.ts`/`.tsx` source files at resolve time.
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    // serverExternalPackages above doesn't propagate through `transpilePackages`
    // (when Next transpiles @pulse/sources, it bundles better-sqlite3 with it).
    // Force the native module to commonjs-require at runtime instead.
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(({ request }, callback) => {
        if (request === "better-sqlite3") return callback(null, "commonjs better-sqlite3");
        callback();
      });
    }
    return config;
  },
};

module.exports = nextConfig;
