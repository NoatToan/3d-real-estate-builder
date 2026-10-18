import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app: `next build` emits a static site in `out/`.
  output: "export",
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
