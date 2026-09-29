import type { MetadataRoute } from "next";

import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";

// The landing page is the only public route; everything else sits behind
// sign-in. The URL uses the canonical www host, which is the one that serves
// content — the apex only redirects there.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CANONICAL_APP_ORIGIN,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
