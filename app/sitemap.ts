import type { MetadataRoute } from "next";

// The landing page is the only public route; everything else sits behind
// sign-in. The URL uses the canonical www host, which is the one that serves
// content — the apex only redirects there.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.wirely.site",
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
