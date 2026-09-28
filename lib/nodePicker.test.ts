import { describe, expect, it } from "bun:test";
import { injectNodePicker, parseReportedNode, type ReportedNode } from "@/lib/nodePicker";

describe("parseReportedNode", () => {
  const node = { nodeId: "1x9k3fz", tag: "h2", x: 1, y: 2, width: 30, height: 40, color: "#0a0a0a", background: null, matrix: [2, 0, 0, 2, 10, 20] as ReportedNode["matrix"] };

  it("accepts a well formed node", () => {
    expect(parseReportedNode(node)).toEqual(node);
  });

  it("rejects what a hostile page could post instead", () => {
    expect(parseReportedNode({ ...node, nodeId: '1"] , body' })).toBeNull();
    expect(parseReportedNode({ ...node, tag: "<img>" })).toBeNull();
    expect(parseReportedNode({ ...node, x: Number.NaN })).toBeNull();
    expect(parseReportedNode(null)).toBeNull();
    expect(parseReportedNode({ ...node, color: "red; x" })?.color).toBeNull();
    expect(parseReportedNode({ ...node, matrix: [1, 0, 0, 1, 0, "x"] })?.matrix).toBeNull();
  });
});

describe("injectNodePicker", () => {
  it("adds the picker script before </body> only", () => {
    const html = injectNodePicker("<html><body><p>x</p></body></html>", "frame-1");
    expect(html).toMatch(/<p>x<\/p><script>[\s\S]*"frame-1"[\s\S]*<\/script><\/body>/);
  });
});
