import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["pdfjs-dist"],
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    return [
      {
        source: "/api/omr",
        destination: "http://127.0.0.1:8000/api/omr",
      },
    ];
  },
};

export default nextConfig;
