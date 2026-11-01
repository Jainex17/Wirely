import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
] as const;

const nextConfig: NextConfig = {
  // Both ship native or binary assets that the bundler must not trace apart.
  // The design engine finds its wasm and fonts relative to its own files at
  // runtime, so the server loads it from node_modules as it ships.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // Chromium resolves its bin/ directory at runtime from import.meta.url, so
  // the file tracer never sees the .br archives inside it. Without these
  // entries get_page_png and the page PNG route fail on the deployment with
  // "input directory does not exist" while working locally, where the macOS
  // branch uses the installed Chrome. Keys are picomatch globs matched against
  // the route, so dynamic segments are written as *.
  outputFileTracingIncludes: {
    "/api/mcp": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/projects/*/pages/*/png": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    // A capture with a design page to compare renders that page.
    "/api/capture": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

export default nextConfig;
