import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // `server-only` throws outside a React Server Components bundle; stub it in tests.
    alias: { "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname },
  },
});
