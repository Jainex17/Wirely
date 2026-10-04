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
    "@open-pencil/core",
    "@open-pencil/scene-graph",
    "canvaskit-wasm",
  ],
  // Chromium resolves its bin/ directory at runtime from import.meta.url, so
  // the file tracer never sees the .br archives inside it. Without these
  // entries get_page_png and the page PNG route fail on the deployment with
  // "input directory does not exist" while working locally, where the macOS
  // branch uses the installed Chrome. Keys are picomatch globs matched against
  // the route, so dynamic segments are written as *.
  outputFileTracingIncludes: {
    // get_page_png and the design tools render and measure text with
    // CanvasKit, which loads its wasm and the default fonts from disk.
    "/api/mcp": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/canvaskit-wasm/bin/canvaskit.wasm",
      "./node_modules/@open-pencil/core/assets/**",
    ],
    "/api/projects/*/document/thumbnail": [
      "./node_modules/canvaskit-wasm/bin/canvaskit.wasm",
      "./node_modules/@open-pencil/core/assets/**",
    ],
    "/api/projects/*/pages/*/png": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
  // Vue's compile-time flags, for the design canvas (components/design).
  compiler: {
    define: {
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
  },
  turbopack: {
    resolveAlias: {
      // CanvasKit, the design canvas renderer, requires fs on its Node path,
      // which the browser build never runs.
      fs: { browser: "./lib/emptyModule.ts" },
    },
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
