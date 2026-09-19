import { makeWsRpcProtocolClient, type WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import { ORCHESTRATION_PROTOCOL_QUERY_PARAM, ORCHESTRATION_PROTOCOL_VERSION, type ClientOrchestrationCommand, type ThreadId, type MessageId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";
import { ShellCache } from "./shell-cache";

export interface AgentMcpCapabilities { providerInstanceIds: string[]; readOnlyProviderInstanceIds: string[] }
export const MCP_UPDATE_REQUIRED = "This T3 server needs the current MCP gateway, read-only execution, and separate turn context support. Rebuild and restart T3 before sending from Lexicon.";
export function readMcpCapabilities(value: unknown): AgentMcpCapabilities {
  const result = value as Record<string, unknown> | null;
  const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === "string");
  if (!result || result.version !== 2 || result.discovery !== "gateway-tools" || result.gatewayApprovalPolicy !== "active-turn-grant" || result.executionContext !== true ||
      !ids(result.providerInstanceIds) || !ids(result.readOnlyProviderInstanceIds))
    throw new Error(MCP_UPDATE_REQUIRED);
  const { providerInstanceIds, readOnlyProviderInstanceIds } = result;
  if (readOnlyProviderInstanceIds.some(id => !providerInstanceIds.includes(id))) throw new Error(MCP_UPDATE_REQUIRED);
  return { providerInstanceIds, readOnlyProviderInstanceIds };
}

export function localT3Origin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw new Error("Connect to a local T3 server on the same machine as this project.");
  return url.origin;
}
export async function t3Descriptor(origin: string) {
  const response = await fetch(`${origin}/.well-known/t3/environment`, { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error("T3 server is unavailable.");
  const descriptor = await response.json() as { environmentId: string; label: string; orchestrationProtocolVersion?: number };
  if (!descriptor.environmentId || (descriptor.orchestrationProtocolVersion ?? 1) !== ORCHESTRATION_PROTOCOL_VERSION)
    throw new Error("This T3 server uses a different protocol. Update Lexicon's pinned client runtime or use a compatible T3 server.");
  return descriptor;
}

/** A scoped T3 client, with the upstream typed RPC transport rather than a second wire implementation. */
export class T3Runtime {
  private shells = new ShellCache<Awaited<ReturnType<T3Runtime["readShell"]>>>();
  private constructor(readonly client: WsRpcProtocolClient, private scope: Scope.Closeable, private origin: string, private cookie: string) {}
  static async connect(origin: string, cookie: string) {
    const scope = await Effect.runPromise(Scope.make());
    try {
      const url = new URL("/ws", origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ticketResponse = await fetch(`${origin}/api/auth/websocket-ticket`, {
        method: "POST", headers: { Cookie: cookie, Origin: origin }, signal: AbortSignal.timeout(5000), redirect: "error",
      });
      if (!ticketResponse.ok) throw new Error("T3 connection expired or access was denied. Pair Lexicon again.");
      const ticket = await ticketResponse.json() as { ticket: string };
      if (!ticket.ticket) throw new Error("T3 did not issue a connection ticket.");
      url.searchParams.set("wsTicket", ticket.ticket);
      url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, String(ORCHESTRATION_PROTOCOL_VERSION));
      const socket = Socket.layerWebSocket(url.toString(), { openTimeout: "10 seconds" }).pipe(
        Layer.provide(Layer.succeed(Socket.WebSocketConstructor, (address) => new WebSocket(address))),
      );
      const protocol = Layer.effect(RpcClient.Protocol, RpcClient.makeProtocolSocket({ retryTransientErrors: false, retryPolicy: Schedule.recurs(0) })).pipe(Layer.provide(Layer.mergeAll(socket, RpcSerialization.layerJson)));
      const context = await Effect.runPromise(Layer.build(protocol).pipe(Effect.provideService(Scope.Scope, scope)));
      const client = await Effect.runPromise(makeWsRpcProtocolClient.pipe(Effect.provide(context), Effect.provideService(Scope.Scope, scope)));
      const runtime = new T3Runtime(client, scope, origin, cookie);
      await runtime.config();
      return runtime;
    } catch (error) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      throw error;
    }
  }
  run<A, E>(effect: Effect.Effect<A, E>) { return Effect.runPromise(effect.pipe(Effect.timeout("20 seconds"))); }
  private async mcpRequest(method: string, path: string, body?: unknown) {
    const response = await fetch(`${this.origin}/api/integrations/mcp${path}`, {
      method, headers: { Cookie: this.cookie, Origin: this.origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!response.ok) throw new Error(response.status === 404
      ? MCP_UPDATE_REQUIRED
      : "T3 could not authorize Lexicon tools for this task. Check the connection and retry.");
    return await response.json() as unknown;
  }
  async mcpCapabilities() {
    return readMcpCapabilities(await this.mcpRequest("GET", ""));
  }
  async registerMcpServer(url: string) { await this.mcpRequest("PUT", "/server", { name: "lexicon", url }); }
  async grantMcp(threadId: ThreadId, messageId: MessageId, bearerToken: string) { await this.mcpRequest("POST", "/grant", { name: "lexicon", threadId, messageId, bearerToken }); }
  async revokeMcp(threadId: ThreadId, messageId: MessageId) { await this.mcpRequest("DELETE", "/grant", { name: "lexicon", threadId, messageId }); }
  config() { return this.run(this.client["server.getConfig"]({})); }
  async dispatch(command: ClientOrchestrationCommand) {
    this.shells.clear();
    try { return await this.run(this.client["orchestration.dispatchCommand"](command)); }
    finally { this.shells.clear(); }
  }
  shell(includeArchived = false, fresh = false) { return this.shells.read(includeArchived, () => this.readShell(includeArchived), fresh); }
  private async readShell(includeArchived: boolean) {
    const items = await this.run(this.client["orchestration.subscribeShell"]({}).pipe(Stream.take(1), Stream.runCollect));
    const item = items[0];
    if (!item || item.kind !== "snapshot") throw new Error("T3 did not provide a project snapshot.");
    if (!includeArchived) return item.snapshot;
    const archived = await this.run(this.client["orchestration.getArchivedShellSnapshot"]({}));
    // Active and archived navigation are distinct upstream queries.
    return { ...item.snapshot, threads: [...item.snapshot.threads, ...archived.threads] };
  }
  watch(threadId: ThreadId, onItem: (item: import("@t3tools/contracts").OrchestrationThreadStreamItem) => void, signal: AbortSignal) {
    return Effect.runPromise(this.client["orchestration.subscribeThread"]({ threadId, requestCompletionMarker: true }).pipe(
      Stream.runForEach(item => Effect.sync(() => { this.shells.clear(); onItem(item); })),
    ), { signal });
  }
  diff(threadId: ThreadId, toTurnCount: number) { return this.run(this.client["orchestration.getFullThreadDiff"]({ threadId, toTurnCount, ignoreWhitespace: false })); }
  close() { this.shells.clear(); return Effect.runPromise(Scope.close(this.scope, Exit.void)); }
}
