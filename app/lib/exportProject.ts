import JSZip from "jszip";
import { saveAs } from "file-saver";
import { PageData } from "../store/useEditorStore";

const BASE_STYLES = `
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
`;

const generatePageHtml = (page: PageData) => {
  const iframeSrc = page.iframeUrl ?? "";
  const content = iframeSrc
    ? `<iframe src="${iframeSrc}" title="${page.title}"></iframe>`
    : `<div style="padding: 24px;">No iframe source configured.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title}</title>
  ${BASE_STYLES}
</head>
<body>
  ${content}
</body>
</html>`;
};

export const exportProject = async (pages: PageData[]) => {
  const zip = new JSZip();

  pages.forEach((page, index) => {
    const html = generatePageHtml(page);
    const fileName =
      index === 0
        ? "index.html"
        : `${page.title.toLowerCase().replace(/\s+/g, "-")}.html`;
    zip.file(fileName, html);
  });

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "openwire-export.zip");
};

export const exportSinglePage = async (page: PageData) => {
  const zip = new JSZip();

  const html = generatePageHtml(page);
  zip.file("index.html", html);

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "openwire-export.zip");
};
