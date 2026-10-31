import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next provides this at build time; in tests it is a no-op.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    env: { APP_TZ: "Asia/Kolkata", NEXT_PUBLIC_CURRENCY: "INR", NEXT_PUBLIC_LOCALE: "en-IN" },
  },
});
