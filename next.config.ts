import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mostly client-side; the only server code is /api/ai-layout (keeps the Claude API key off the client).
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
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
