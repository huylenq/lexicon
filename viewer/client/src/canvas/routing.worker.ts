import { runRoutingJob, type RoutingRequest, type RoutingReply } from "./routing-job";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RoutingRequest>) => void) | null;
  postMessage: (reply: RoutingReply) => void;
};
scope.onmessage = event => scope.postMessage(runRoutingJob(event.data));
