import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove X-Powered-By header
  poweredByHeader: false,
  // Allow images from any domain (for user avatars)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // Telegram's WebView pins cached pages instead of revalidating (same issue
  // the backend works around with NoCacheStaticFiles) — a page cached while a
  // deploy was broken keeps erroring forever ("This page couldn't load").
  // Forbid storing the HTML documents; hashed /_next/static assets keep their
  // immutable caching.
  async headers() {
    return [
      {
        source: "/((?!_next/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
