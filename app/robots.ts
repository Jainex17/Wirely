import type { MetadataRoute } from "next";

// Served at /robots.txt. Anonymous crawlers should always find an explicit
// answer here: a 404 is usually read as "allow all", but an explicit file
// removes any doubt for less forgiving fetchers, including AI agents. The
// disallowed paths are the ones proxy.ts protects with sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/wire/", "/setting/", "/share/"],
      },
    ],
    sitemap: "https://www.wirely.site/sitemap.xml",
  };
}
