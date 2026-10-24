// OVYX Stage 3 prototype worker. This module is only loaded after explicit user opt-in.
import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm@0.2.86";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event) => handler.onmessage(event);
self.addEventListener("unhandledrejection", (event) => {
  // Do not leak a remote payload into logs; the page shows a bounded local error.
  event.preventDefault();
});
