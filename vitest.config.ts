import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": resolve(__dirname, "src/renderer/src/app"),
      "@layout": resolve(__dirname, "src/renderer/src/layout"),
      "@shared": resolve(__dirname, "src/shared"),
      "@backend": resolve(__dirname, "src/backend"),
      "@features": resolve(__dirname, "src/renderer/src/features"),
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@theme": resolve(__dirname, "src/renderer/src/shared/theme"),
      "@ui": resolve(__dirname, "src/renderer/src/shared/ui"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "src/renderer/src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: [resolve(__dirname, "src/renderer/src/test/setup.ts")],
  },
});
