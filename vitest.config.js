import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    testTimeout: 5000,
    coverage: {
      provider: "v8",
      include: ["public/assets/js/**"],
      exclude: [
        "public/assets/js/main.js",
        "public/assets/js/main-stats.js",
        "public/assets/js/llm-prompts-data.js",
        "public/assets/js/supabase-config.js",
      ],
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
    },
  },
});
