import { describe, expect, it } from "bun:test";
import sharp from "sharp";

import {
  AssetRejectedError,
  checkAssetQuota,
  cleanAssetName,
  compressImage,
  createAssetUploadPath,
  inlineAssets,
  verifyAssetUpload,
} from "@/lib/projectAssets";

const secret = Buffer.alloc(32, 7);
const ASSET_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

const paramsOf = (path: string) => new URL(path, "https://wirely.test").searchParams;

describe("asset upload links", () => {
  it("accept the project and user they were signed for until they expire", () => {
    const path = createAssetUploadPath({ projectId: "p1", userId: "u1" }, 1_000, secret);
    expect(verifyAssetUpload(paramsOf(path), 2_000, secret)).toEqual({ projectId: "p1", userId: "u1" });
    expect(verifyAssetUpload(paramsOf(path), 1_000 + 16 * 60 * 1000, secret)).toBeNull();
  });

  it("reject a link pointed at another project", () => {
    const params = paramsOf(createAssetUploadPath({ projectId: "p1", userId: "u1" }, 1_000, secret));
    params.set("project", "p2");
    expect(verifyAssetUpload(params, 2_000, secret)).toBeNull();
  });
});

describe("compressImage", () => {
  it("stores a flat color PNG as lossless WebP with the same pixels", async () => {
    const png = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const image = await compressImage(png);
    expect(image.mimeType).toBe("image/webp");
    expect(image.data.byteLength).toBeLessThan(png.byteLength);
    const [before, after] = await Promise.all(
      [png, image.data].map((buffer) => sharp(buffer).ensureAlpha().raw().toBuffer()),
    );
    expect(after.equals(before)).toBe(true);
  });

  it("scales a huge image down to 2560 px on its long side", async () => {
    const big = await sharp({ create: { width: 4000, height: 1000, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer();
    const image = await compressImage(big);
    expect([image.width, image.height]).toEqual([2560, 640]);
  });

  it("rejects a file that is not an image", async () => {
    await expect(compressImage(Buffer.from("<svg onload=alert(1)>"))).rejects.toBeInstanceOf(
      AssetRejectedError,
    );
  });
});

describe("assets in pages", () => {
  it("inlines known assets and leaves unknown ones", async () => {
    const html = `<img src="/api/assets/${ASSET_ID}"><img src="/api/assets/00000000-0000-4000-8000-000000000000">`;
    const inlined = await inlineAssets(html, async (id) =>
      id === ASSET_ID ? { mimeType: "image/png", data: Buffer.from("x") } : null,
    );
    expect(inlined).toContain('src="data:image/png;base64,eA=="');
    expect(inlined).toContain("/api/assets/00000000-0000-4000-8000-000000000000");
  });

  it("cleans names that could break out of an attribute", () => {
    expect(cleanAssetName('logo"><script>.png')).toBe("logoscript.png");
    expect(cleanAssetName("   ")).toBe("image");
  });
});

describe("checkAssetQuota", () => {
  const MB = 1024 * 1024;

  it("lets an image in while the project and the user are under their limits", () => {
    expect(
      checkAssetQuota({ projectImageCount: 29, userStoredBytes: 20 * MB, newBytes: 5 * MB }),
    ).toBeNull();
  });

  it("refuses a 31st image in one project", () => {
    expect(
      checkAssetQuota({ projectImageCount: 30, userStoredBytes: 0, newBytes: 1 }),
    ).toContain("30 images");
  });

  it("refuses an image that would take the user past 25 MB across projects", () => {
    expect(
      checkAssetQuota({ projectImageCount: 0, userStoredBytes: 24.5 * MB, newBytes: MB }),
    ).toContain("24.5 MB is used");
  });
});
