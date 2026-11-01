import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gemini API key is server-side only and must never reach the client.
  // It is read from process.env in the route handler, not inlined here.
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Service worker must always be fetched fresh so updates land.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
