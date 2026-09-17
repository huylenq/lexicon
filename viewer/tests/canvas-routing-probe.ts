import type { Page } from "@playwright/test";

export async function installRoutingProbe(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = (window as any).routingProbe = { requests: 0, pending: 0, delay: 0 };
    window.Worker = class extends NativeWorker {
      override postMessage(message: any, options?: any) {
        if (Array.isArray(message?.edges)) { state.requests++; state.pending++; }
        super.postMessage(message, options);
      }
      override set onmessage(listener: ((this: Worker, event: MessageEvent) => any) | null) {
        super.onmessage = listener && (event => {
          const deliver = () => { state.pending--; listener.call(this, event); };
          if (state.delay) setTimeout(deliver, state.delay);
          else deliver();
        });
      }
    };
  });
}
