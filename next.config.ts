import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // NOTE: #70's serverExternalPackages/outputFileTracingIncludes for
  // @sparticuz/chromium were REMOVED — this Next 16 Turbopack production build did
  // not honor them (the deployed chunk hash was byte-identical with vs without the
  // config). The PDF launcher now uses @sparticuz/chromium-min with a REMOTE binary
  // (src/pdf/chromium-launcher.ts), so nothing needs bundling/externalizing.

  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
