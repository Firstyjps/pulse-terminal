/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pulse/ui", "@pulse/sources", "@pulse/charts", "@pulse/i18n"],
  typedRoutes: false,
  webpack(config) {
    // The workspace packages ship `"type":"module"` source-only, so internal
    // imports use the NodeNext-required `.js` extension. Tell webpack to map
    // those back to the `.ts`/`.tsx` source files at resolve time.
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

module.exports = nextConfig;
