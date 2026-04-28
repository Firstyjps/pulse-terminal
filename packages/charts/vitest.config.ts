import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-side render smoke tests don't need jsdom — `renderToStaticMarkup`
    // walks React trees without DOM. Recharts components produce empty
    // ResponsiveContainer wrappers (no measurement available) but won't
    // throw, which is exactly what we want a smoke test to assert.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
