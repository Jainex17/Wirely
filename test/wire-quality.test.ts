import { describe, expect, it } from "bun:test";
import { evaluateWireHtmlQuality } from "@/lib/wireQuality";

const validLandingHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" />
</head>
<body class="bg-slate-50 text-slate-900 p-4 px-4 py-6 m-2 mx-3 my-2">
  <header class="p-6 px-8 py-10 m-2 mx-2 my-2">
    <h1 class="text-6xl py-24">Built For Product Teams</h1>
    <p class="text-lg">A conversion-ready homepage.</p>
    <a href="#cta" class="hover:bg-slate-900 focus-visible:outline-none p-3 px-4 py-2 m-1">Get Started</a>
  </header>
  <main class="p-6 px-6 py-6 m-2 mx-2 my-2">
    <section class="p-5 px-5 py-5 m-2 mx-1 my-1">
      <h2 class="text-xl">Features and benefits</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-2 px-2 py-2 m-1">value</div>
    </section>
    <section class="p-5 px-5 py-5 m-2 mx-1 my-1">
      <h2 class="text-xl">Trusted by customers</h2>
      <p class="text-base">social proof and ratings</p>
    </section>
    <section id="cta" class="p-5 px-5 py-5 m-2 mx-1 my-1">
      <h2 class="text-xl">Request demo</h2>
      <button class="hover:bg-slate-800 focus:ring p-2 px-3 py-2 m-1">Start for free</button>
    </section>
  </main>
  <footer class="p-4 px-4 py-4 m-2 mx-2 my-2">Contact sales</footer>
</body>
</html>`;

describe("evaluateWireHtmlQuality", () => {
  it("marks structured landing HTML as renderable with decent quality", () => {
    const report = evaluateWireHtmlQuality({
      html: validLandingHtml,
      allowImages: false,
      userPrompt: "marketing landing page for a dev tool",
    });

    expect(report.isRenderable).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.violations.includes("document_structure_incomplete")).toBe(false);
    expect(report.violations.includes("style_tag_present")).toBe(false);
  });

  it("flags style tags, inline styles, images, and disallowed scripts", () => {
    const report = evaluateWireHtmlQuality({
      html: `<!doctype html><html><body class="bg-white text-black">
        <header></header><main><section>hello</section></main><footer></footer>
        <style>.x{color:red}</style>
        <div style="color:red">inline style</div>
        <img src="https://example.com/image.png" />
        <script src="https://evil.example/x.js"></script>
      </body></html>`,
      allowImages: false,
      userPrompt: "landing page",
    });

    expect(report.violations.includes("style_tag_present")).toBe(true);
    expect(report.violations.includes("inline_style_present")).toBe(true);
    expect(report.violations.includes("image_present_without_permission")).toBe(true);
    expect(report.violations.includes("disallowed_script_detected")).toBe(true);
  });

  it("enforces dashboard chart rendering requirements", () => {
    const missingCharts = evaluateWireHtmlQuality({
      html: `<!doctype html><html><body class="bg-slate-950 text-slate-100">
        <header></header><main><section>coming soon chart</section></main><footer></footer>
      </body></html>`,
      allowImages: false,
      userPrompt: "analytics dashboard",
    });
    expect(missingCharts.violations.includes("chart_placeholder_detected")).toBe(true);
    expect(missingCharts.violations.includes("missing_chart_render_signal")).toBe(true);

    const withCharts = evaluateWireHtmlQuality({
      html: `<!doctype html>
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
        </head>
        <body class="bg-slate-950 text-slate-100">
          <header></header>
          <main>
            <section><canvas id="geoTrendChart"></canvas></section>
            <section><canvas id="engineSplitChart"></canvas></section>
            <section>
              <svg><path d="M0 0 L10 10"></path></svg>
              <svg><rect width="10" height="10"></rect></svg>
              <svg><circle cx="5" cy="5" r="5"></circle></svg>
              chart trend series axis
            </section>
          </main>
          <footer></footer>
        </body>
      </html>`,
      allowImages: false,
      userPrompt: "dashboard with charts",
    });
    expect(withCharts.violations.includes("missing_chart_render_signal")).toBe(false);
    expect(withCharts.violations.includes("missing_svg_icon_signal")).toBe(false);
  });

  it("flags dashboard-shell output when landing intent is explicit", () => {
    const report = evaluateWireHtmlQuality({
      html: `<!doctype html><html><body class="bg-slate-950 text-slate-100">
        <header></header>
        <main class="flex">
          <aside>Sidebar navigation</aside>
          <section><table><tr><td>KPI</td></tr></table><canvas id="trend"></canvas></section>
        </main>
        <footer></footer>
      </body></html>`,
      allowImages: false,
      userPrompt:
        "Design a landing page for SERanking and include product names such as SEO Dashboard.",
    });

    expect(report.violations.includes("intent_mismatch_dashboard_in_landing")).toBe(
      true,
    );
  });
});
