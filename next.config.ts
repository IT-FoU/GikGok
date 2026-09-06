import type { NextConfig } from "next";

/**
 * Security + caching headers for Phase 11 release hardening.
 * Content-Security-Policy is applied per-request in src/proxy.ts with a
 * script nonce + 'strict-dynamic'. Do not also emit a static CSP here
 * (would conflict with the nonce policy). style-src still allows
 * 'unsafe-inline' in proxy — documented limitation, not a full style lock.
 */

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Ticket attachments advertise 3 × 5 MiB images. Bound the Server Action
    // multipart body to that product maximum plus form overhead (do not lower
    // the product limit to Next's 1 MB default).
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
