import type { PlannedOutput } from "@/lib/wireGenerationTypes";

export const UNSPLASH_IMAGE_HOSTS = ["images.unsplash.com", "plus.unsplash.com"] as const;

type ImageSlot = PlannedOutput["imageSlots"][number];

interface ResolveStockImagesInHtmlOptions {
  html: string;
  slots: PlannedOutput["imageSlots"];
  unsplashAccessKey?: string | null;
  seed: string;
}

interface FindMissingStockImageSlotIdsOptions {
  html: string;
  slots: Array<Pick<ImageSlot, "id">>;
}

interface UnsplashPhoto {
  id: string;
  urls?: {
    raw?: string;
    regular?: string;
  };
  links?: {
    html?: string;
  };
  user?: {
    name?: string;
    username?: string;
    links?: {
      html?: string;
    };
  };
}

export interface ResolvedStockImageMetadata {
  slotId: string;
  source: "unsplash" | "placeholder";
  query: string;
  aspectRatio: ImageSlot["aspectRatio"];
  url: string;
  photographerName?: string;
  photographerProfileUrl?: string;
  photoPageUrl?: string;
}

export interface ResolveStockImagesInHtmlResult {
  html: string;
  metadata: ResolvedStockImageMetadata[];
}

const buildMissingSlotMarkup = (slot: ImageSlot) => {
  const imageTag = applySlotToTag({
    tag: `<img data-wirely-stock-slot="${slot.id}" src="wirely-stock://${slot.id}" alt="${slot.altHint}" class="h-full w-full object-cover" />`,
    slot,
    imageUrl: `wirely-stock://${slot.id}`,
    source: "placeholder",
  });

  return `
<section data-wirely-generated-stock-slot="${slot.id}" class="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
  <figure class="overflow-hidden rounded-3xl border border-black/10 bg-black/5 shadow-sm">
    <div class="${slot.priority === "hero" ? "aspect-[16/9] sm:aspect-[21/9]" : "aspect-[4/3]"} w-full">
      ${imageTag}
    </div>
    <figcaption class="px-4 py-3 text-sm text-black/60">${slot.altHint}</figcaption>
  </figure>
</section>`.trim();
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const ratioDimensions = (aspectRatio: ImageSlot["aspectRatio"]) => {
  switch (aspectRatio) {
    case "21:9":
      return { width: 2100, height: 900, orientation: "landscape" as const };
    case "16:9":
      return { width: 1600, height: 900, orientation: "landscape" as const };
    case "4:3":
      return { width: 1200, height: 900, orientation: "landscape" as const };
    case "1:1":
      return { width: 1200, height: 1200, orientation: "squarish" as const };
    case "3:4":
      return { width: 900, height: 1200, orientation: "portrait" as const };
    default:
      return { width: 1600, height: 900, orientation: "landscape" as const };
  }
};

const optimizeUnsplashUrl = ({
  raw,
  aspectRatio,
  priority,
}: {
  raw: string;
  aspectRatio: ImageSlot["aspectRatio"];
  priority: ImageSlot["priority"];
}) => {
  try {
    const url = new URL(raw);
    const dimensions = ratioDimensions(aspectRatio);
    const width = priority === "hero" ? dimensions.width : Math.round(dimensions.width * 0.8);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "crop");
    url.searchParams.set("crop", "entropy");
    url.searchParams.set("q", "80");
    url.searchParams.set("w", String(width));
    url.searchParams.set("dpr", "2");
    return url.toString();
  } catch {
    return raw;
  }
};

const encodeSvgDataUri = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const buildPlaceholderUrl = ({
  slotId,
  aspectRatio,
}: {
  slotId: string;
  aspectRatio: ImageSlot["aspectRatio"];
}) => {
  const dims = ratioDimensions(aspectRatio);
  const label = slotId.replace(/[-_]+/g, " ").trim() || "placeholder";
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${dims.width}\" height=\"${dims.height}\" viewBox=\"0 0 ${dims.width} ${dims.height}\"><defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop stop-color=\"#e2e8f0\" offset=\"0\"/><stop stop-color=\"#cbd5e1\" offset=\"1\"/></linearGradient></defs><rect width=\"${dims.width}\" height=\"${dims.height}\" fill=\"url(#g)\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" font-family=\"system-ui, sans-serif\" font-size=\"42\" fill=\"#334155\">${label}</text></svg>`;
  return encodeSvgDataUri(svg);
};

const getImgTagSlotId = (imgTag: string) => {
  const slotMatch = imgTag.match(
    /\bdata-wirely-stock-slot\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i,
  );
  return (slotMatch?.[2] ?? slotMatch?.[3] ?? slotMatch?.[4] ?? "").trim();
};

const getReferencedStockSlotIds = (html: string) => {
  const explicitSlotIds = Array.from(
    html.matchAll(
      /data-wirely-stock-slot\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    ),
  )
    .map((match) => (match[2] ?? match[3] ?? match[4] ?? "").trim().toLowerCase())
    .filter(Boolean);

  const wirelySrcIds = Array.from(
    html.matchAll(/wirely-stock:\/\/([a-z0-9_-]+)/gi),
  )
    .map((match) => (match[1] ?? "").trim().toLowerCase())
    .filter(Boolean);

  return new Set([...explicitSlotIds, ...wirelySrcIds]);
};

const setOrReplaceAttribute = (tag: string, attribute: string, value: string) => {
  const attrPattern = new RegExp(
    `\\b${attribute}\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)`,
    "i",
  );
  const escapedValue = value.replace(/"/g, "&quot;");
  if (attrPattern.test(tag)) {
    return tag.replace(attrPattern, `${attribute}="${escapedValue}"`);
  }
  if (/\/>$/.test(tag)) {
    return tag.replace(/\/>$/, ` ${attribute}="${escapedValue}"/>`);
  }
  return tag.replace(/>$/, ` ${attribute}="${escapedValue}">`);
};

const applySlotToTag = ({
  tag,
  slot,
  imageUrl,
  source,
}: {
  tag: string;
  slot: ImageSlot;
  imageUrl: string;
  source: "unsplash" | "placeholder";
}) => {
  const dimensions = ratioDimensions(slot.aspectRatio);
  let nextTag = setOrReplaceAttribute(tag, "src", imageUrl);
  nextTag = setOrReplaceAttribute(nextTag, "alt", slot.altHint);
  nextTag = setOrReplaceAttribute(nextTag, "width", String(dimensions.width));
  nextTag = setOrReplaceAttribute(nextTag, "height", String(dimensions.height));
  nextTag = setOrReplaceAttribute(nextTag, "decoding", "async");
  nextTag = setOrReplaceAttribute(nextTag, "data-wirely-stock-source", source);
  if (slot.priority === "hero") {
    nextTag = setOrReplaceAttribute(nextTag, "fetchpriority", "high");
    nextTag = setOrReplaceAttribute(nextTag, "loading", "eager");
  } else {
    nextTag = setOrReplaceAttribute(nextTag, "loading", "lazy");
  }
  return nextTag;
};

const buildUnsplashSearchUrl = ({
  query,
  orientation,
}: {
  query: string;
  orientation: "landscape" | "portrait" | "squarish";
}) => {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", orientation);
  url.searchParams.set("per_page", "30");
  url.searchParams.set("content_filter", "high");
  return url.toString();
};

const fetchUnsplashCandidates = async ({
  accessKey,
  query,
  orientation,
}: {
  accessKey: string;
  query: string;
  orientation: "landscape" | "portrait" | "squarish";
}): Promise<UnsplashPhoto[]> => {
  const response = await fetch(buildUnsplashSearchUrl({ query, orientation }), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { results?: UnsplashPhoto[] };
  return Array.isArray(payload.results) ? payload.results : [];
};

const pickDeterministic = <T,>(items: T[], seed: string) => {
  if (items.length === 0) return null;
  return items[hashString(seed) % items.length] ?? null;
};

const resolveSlotImage = async ({
  slot,
  seed,
  unsplashAccessKey,
}: {
  slot: ImageSlot;
  seed: string;
  unsplashAccessKey?: string | null;
}): Promise<ResolvedStockImageMetadata> => {
  const fallback = {
    slotId: slot.id,
    source: "placeholder" as const,
    query: slot.query,
    aspectRatio: slot.aspectRatio,
    url: buildPlaceholderUrl({ slotId: slot.id, aspectRatio: slot.aspectRatio }),
  };

  if (!unsplashAccessKey) {
    return fallback;
  }

  const dimensions = ratioDimensions(slot.aspectRatio);
  const photos = await fetchUnsplashCandidates({
    accessKey: unsplashAccessKey,
    query: slot.query,
    orientation: dimensions.orientation,
  });
  const selected = pickDeterministic(photos, `${seed}:${slot.id}`);
  if (!selected) return fallback;

  const raw = selected.urls?.raw?.trim() || selected.urls?.regular?.trim();
  if (!raw) return fallback;

  return {
    slotId: slot.id,
    source: "unsplash",
    query: slot.query,
    aspectRatio: slot.aspectRatio,
    url: optimizeUnsplashUrl({
      raw,
      aspectRatio: slot.aspectRatio,
      priority: slot.priority,
    }),
    photographerName: selected.user?.name,
    photographerProfileUrl: selected.user?.links?.html,
    photoPageUrl: selected.links?.html,
  };
};

export const injectStockImageMetadata = (
  html: string,
  metadata: ResolvedStockImageMetadata[],
) => {
  if (metadata.length === 0) return html;
  const safeJson = JSON.stringify(metadata)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
  const metaTag = `<meta name=\"wirely-stock-attribution\" content=\"${safeJson}\">`;

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${metaTag}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${metaTag}</head>`);
  }
  return `<!doctype html><html><head>${metaTag}</head><body>${html}</body></html>`;
};

export const isAllowedStockImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "https:" &&
      UNSPLASH_IMAGE_HOSTS.some((host) => parsed.hostname.toLowerCase() === host)
    );
  } catch {
    return false;
  }
};

export const resolveStockImagesInHtml = async ({
  html,
  slots,
  unsplashAccessKey,
  seed,
}: ResolveStockImagesInHtmlOptions): Promise<ResolveStockImagesInHtmlResult> => {
  if (!html.trim() || slots.length === 0) {
    return { html, metadata: [] };
  }

  const slotMap = new Map(slots.map((slot) => [slot.id.toLowerCase(), slot]));
  const metadataBySlot = new Map<string, ResolvedStockImageMetadata>();

  const slotIdsInHtml = Array.from(html.matchAll(/data-wirely-stock-slot\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/gi))
    .map((match) => (match[2] ?? match[3] ?? match[4] ?? "").trim().toLowerCase())
    .filter(Boolean);

  for (const slotId of slotIdsInHtml) {
    if (metadataBySlot.has(slotId)) continue;
    const slot = slotMap.get(slotId);
    if (!slot) continue;
    const metadata = await resolveSlotImage({
      slot,
      seed,
      unsplashAccessKey,
    });
    metadataBySlot.set(slotId, metadata);
  }

  const nextHtml = html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const slotId = getImgTagSlotId(imgTag).toLowerCase();
    if (!slotId) return imgTag;

    const slot = slotMap.get(slotId);
    const metadata = metadataBySlot.get(slotId);
    if (!slot || !metadata) {
      return imgTag;
    }

    return applySlotToTag({
      tag: imgTag,
      slot,
      imageUrl: metadata.url,
      source: metadata.source,
    });
  });

  return {
    html: nextHtml,
    metadata: Array.from(metadataBySlot.values()),
  };
};

export const ensurePlannedStockImageSlots = ({
  html,
  slots,
}: ResolveStockImagesInHtmlOptions) => {
  if (!html.trim() || slots.length === 0) {
    return html;
  }

  const missingSlotIds = new Set(
    findMissingStockImageSlotIds({
      html,
      slots,
    }),
  );
  if (missingSlotIds.size === 0) {
    return html;
  }

  const missingSlots = slots.filter((slot) => missingSlotIds.has(slot.id.toLowerCase()));
  if (missingSlots.length === 0) {
    return html;
  }

  const markup = missingSlots
    .slice()
    .sort((left, right) => {
      if (left.priority === right.priority) return 0;
      return left.priority === "hero" ? -1 : 1;
    })
    .map((slot) => buildMissingSlotMarkup(slot))
    .join("\n");

  if (/<main[^>]*>/i.test(html)) {
    return html.replace(/<main([^>]*)>/i, `<main$1>\n${markup}\n`);
  }

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>\n<main>\n${markup}\n`);
  }

  return `<!doctype html><html><body><main>${markup}${html}</main></body></html>`;
};

export const findMissingStockImageSlotIds = ({
  html,
  slots,
}: FindMissingStockImageSlotIdsOptions) => {
  if (!html.trim() || slots.length === 0) {
    return slots.map((slot) => slot.id.toLowerCase());
  }

  const referencedSlotIds = getReferencedStockSlotIds(html);
  return slots
    .map((slot) => slot.id.trim().toLowerCase())
    .filter((slotId) => !referencedSlotIds.has(slotId));
};

export const removeStockSlotAttributes = (html: string) =>
  html.replace(/\sdata-wirely-stock-slot\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

export const stripDisallowedBitmapImages = (html: string) =>
  html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = (srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "").trim();
    if (isAllowedStockImageUrl(src)) {
      return imgTag;
    }
    return "";
  });

export const stockImageHosts = Array.from(UNSPLASH_IMAGE_HOSTS);
