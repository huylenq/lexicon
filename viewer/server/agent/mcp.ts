import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { localOrigin, resolveConnection } from "./connection";

/** Stdio compatibility transport; the viewer's MCP server owns the single tool contract. */
export function createMcpServer(baseURL = process.env.LEXICON_URL, token = process.env.LEXICON_DESKTOP_TOKEN) {
  if (baseURL) localOrigin(baseURL);
  const server = new Server({ name: "lexicon", version: "0.2.0" }, { capabilities: { tools: {} } });
  async function connected<T>(run: (client: Client) => Promise<T>) {
    const { base, token: secret } = await resolveConnection(baseURL, token);
    const client = new Client({ name: "lexicon-stdio", version: "0.2.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/agent/mcp", base), { requestInit: { headers: secret ? { "x-lexicon-desktop-token": secret } : {} } }));
      return await run(client);
    } finally { await client.close(); }
  }
  server.setRequestHandler(ListToolsRequestSchema, () => connected(client => client.listTools()));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => connected(client => client.callTool(request.params, undefined, { signal: extra.signal })));
  return server;
}
if (import.meta.main) {
  try { await createMcpServer().connect(new StdioServerTransport()); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
