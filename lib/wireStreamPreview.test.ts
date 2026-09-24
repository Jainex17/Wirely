import { describe, expect, it } from "bun:test";
import {
  buildStreamingPreviewHtml,
  collectStreamedText,
  type StreamTextPart,
} from "@/lib/wireStreamPreview";

const streamOf = async function* (parts: StreamTextPart[]) {
  yield* parts;
};

describe("collectStreamedText", () => {
  it("snapshots at most once per interval and flushes the full text at the end", async () => {
    const clock = [0, 100, 600, 700, 800, 900];
    let tick = 0;
    const snapshots: string[] = [];

    const text = await collectStreamedText(
      streamOf([
        { type: "text-delta", textDelta: "a" },
        { type: "text-delta", textDelta: "b" },
        { type: "step-finish" },
        { type: "text-delta", textDelta: "c" },
        { type: "text-delta", textDelta: "d" },
      ]),
      (snapshot) => snapshots.push(snapshot),
      { intervalMs: 500, now: () => clock[Math.min(tick++, clock.length - 1)] },
    );

    expect(text).toBe("abcd");
    expect(snapshots).toEqual(["ab", "abcd"]);
  });

  it("rethrows a provider error part so retries still see it", async () => {
    const failure = new Error("429 Too Many Requests");

    await expect(
      collectStreamedText(
        streamOf([{ type: "text-delta", textDelta: "<!doctype" }, { type: "error", error: failure }]),
        () => {},
      ),
    ).rejects.toBe(failure);
  });
});

describe("buildStreamingPreviewHtml", () => {
  it("is empty before the body starts", () => {
    expect(buildStreamingPreviewHtml("TITLE: Home\nHTML:\n<!doctype html><html><head>")).toBe("");
  });

  it("sanitizes the partial document before it leaves the server", () => {
    const preview = buildStreamingPreviewHtml(
      '<!doctype html><html><head></head><body><div onclick="steal()">Hi</div><iframe src="https://evil.test"></iframe><p>more',
    );

    expect(preview).toContain("Content-Security-Policy");
    expect(preview).toContain("<div>Hi</div>");
    expect(preview).not.toContain("onclick");
    expect(preview).not.toContain("<iframe");
  });
});
