import { describe, expect, it } from "bun:test";
import { buildGenerationTools, GENERATION_TOOL_NAMES, toolResultText } from "@/lib/design/generation";
import { DESIGN_CATALOG } from "@/lib/mcp/designTools";
import { MCP_TOOLS } from "@/lib/mcp/protocol";

const CATALOG = [...MCP_TOOLS, ...DESIGN_CATALOG];

describe("buildGenerationTools", () => {
  it("offers every generation tool, without asking the model for the project id", () => {
    const tools = buildGenerationTools(CATALOG, async () => ({ content: [] }));
    expect(Object.keys(tools).sort()).toEqual([...GENERATION_TOOL_NAMES].sort());
    const schema = (tools.add_screen as unknown as { parameters: { jsonSchema: { properties: object; required: string[] } } })
      .parameters.jsonSchema;
    expect(Object.keys(schema.properties)).not.toContain("projectId");
    expect(schema.required).toEqual(["name", "device", "jsx"]);
  });

  it("runs a call through the handler and gives the model its text", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const tools = buildGenerationTools(CATALOG, async (name, args) => {
      calls.push([name, args]);
      return { content: [{ type: "text", text: "Added screen" }] };
    });
    const execute = (tools.set_fill as unknown as { execute: (args: object, options: object) => Promise<string> }).execute;
    expect(await execute({ id: "1:2", color: "#fff" }, {})).toBe("Added screen");
    expect(calls).toEqual([["set_fill", { id: "1:2", color: "#fff" }]]);
  });
});

describe("toolResultText", () => {
  it("marks errors and leaves images out", () => {
    expect(
      toolResultText({
        isError: true,
        content: [
          { type: "text", text: "Node not found" },
          { type: "image", data: "x", mimeType: "image/png" },
        ],
      }),
    ).toBe("Error: Node not found");
  });
});
