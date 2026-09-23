/**
 * The Wirely MCP endpoint.
 *
 * Stateless streamable HTTP: clients POST one JSON-RPC message and read one
 * JSON body back. No SSE channel and no session survive between requests,
 * which is the only shape a serverless function can hold.
 *
 * Auth reuses the personal bearer tokens minted in settings — the same
 * credential the local agent logs in with. Tokens are accepted only here and
 * on `/api/agent/*`, never on the session-authenticated profile routes.
 */
import { authenticateAgentRequest } from "@/lib/auth/apiToken";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOLS,
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  negotiateProtocolVersion,
  parseRpcMessage,
  rpcError,
  rpcResult,
} from "@/lib/mcp/protocol";
import { callTool } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// get_page_png launches a headless browser, so it can need most of a minute.
export const maxDuration = 60;

/**
 * Full-page HTML rides inside tool arguments, so this carries the same ceiling
 * the local-agent result route uses for generated screens.
 */
const MCP_BODY_MAX_BYTES = 4 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const unauthorized = () =>
  Response.json(
    { error: "Unauthenticated" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="wirely-mcp"' } },
  );

const methodNotAllowed = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } });

export async function POST(request: Request) {
  try {
    const user = await authenticateAgentRequest(request);
    if (!user) return unauthorized();

    const parsed = await readJsonBodyWithLimit(request, MCP_BODY_MAX_BYTES);
    if (!parsed.ok) return parsed.response;

    const outcome = parseRpcMessage(parsed.data);
    if (!outcome.ok) return json(rpcError(null, outcome.code, outcome.message));

    // A notification expects no response body, just acknowledgment.
    if (outcome.message.kind === "notification") {
      return new Response(null, { status: 202 });
    }

    const { id, method, params } = outcome.message;

    switch (method) {
      case "initialize":
        return json(
          rpcResult(id, {
            protocolVersion: negotiateProtocolVersion(params.protocolVersion),
            capabilities: { tools: {} },
            serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
          }),
        );

      case "tools/list":
        return json(rpcResult(id, { tools: MCP_TOOLS }));

      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : {};
        if (!name) {
          return json(rpcError(id, RPC_INVALID_PARAMS, "tools/call requires a tool name."));
        }
        logger.info("mcp.tool_called", { tool: name });
        return json(rpcResult(id, await callTool(user.id, name, args)));
      }

      case "ping":
        return json(rpcResult(id, {}));

      default:
        return json(rpcError(id, RPC_METHOD_NOT_FOUND, `Method "${method}" is not supported.`));
    }
  } catch (error) {
    logger.error("mcp.request_failed", { error });
    return json(rpcError(null, -32603, "Internal error."));
  }
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
