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
  // Keep the Chromium/Puppeteer packages OUT of the server bundle. The prod build
  // (Turbopack, Next 16) was relocating @sparticuz/chromium into a chunk, so at
  // runtime executablePath() couldn't find its own bin/ dir and the engagement-
  // letter PDF 500'd with:
  //   "The input directory /var/task/node_modules/@sparticuz/chromium/bin does not
  //    exist … you must externalize @sparticuz/chromium so it is not relocated."
  // Externalizing forces a native require from node_modules, keeping bin/ in place
  // for every route that renders a PDF (letter, invoice, plan). Both packages are on
  // Next's built-in list, but the deployed evidence showed it wasn't applied under
  // Turbopack — so declare them explicitly.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  // Force the Chromium binary archives into every serverless function that renders
  // a PDF. @sparticuz/chromium loads bin/chromium.br (+ fonts/swiftshader) via a
  // RUNTIME `existsSync(join(input, "chromium.br"))` — a dynamic fs read the file
  // tracer cannot follow, so without this the bin/ dir is absent at runtime and
  // executablePath() throws "input directory … /bin does not exist". Externalizing
  // (above) stops the code being relocated; this ships the binary alongside it.
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/invoice/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/pdf/[planId]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },

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
