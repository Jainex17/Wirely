import type { MetadataRoute } from "next";

import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";

// The public routes; everything else sits behind sign-in. URLs use the
// canonical www host, which is the one that serves content. The apex only
// redirects there.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CANONICAL_APP_ORIGIN,
      changeFrequency: "weekly",
      priority: 1,
    },
    { url: `${CANONICAL_APP_ORIGIN}/docs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${CANONICAL_APP_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_APP_ORIGIN}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
