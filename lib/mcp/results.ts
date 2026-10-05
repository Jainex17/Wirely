/** Tool results in the shape MCP clients show the model, shared by every handler module. */
import type { ToolCallResult, ToolContent } from "@/lib/mcp/protocol";

export const text = (value: string): ToolContent => ({ type: "text", text: value });
export const succeed = (value: string): ToolCallResult => ({ content: [text(value)] });
export const fail = (value: string): ToolCallResult => ({ content: [text(value)], isError: true });
