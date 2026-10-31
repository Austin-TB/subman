import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: nearly every page reads the session,
  // and dynamic-by-default rendering keeps the auth-gated pages simple.
  experimental: {
    // Enables forbidden() for role guards (renders app/forbidden.tsx with a 403).
    authInterrupts: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
