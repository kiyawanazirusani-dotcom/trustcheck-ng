import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    // Pure logic tests run in node. DOM-touching helpers are unit-tested with
    // injected/mocked dependencies rather than a real browser API.
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "out", "dist"],
    coverage: { reporter: ["text"] },
  },
});
