# OVYX AI — Stage 3: Browser-local inference prototype

**Status:** Implementation in progress; not accepted  
**Branch:** `feat/stage-3-browser-local-ai-prototype`  
**Scope:** A small isolated page to prove real browser-local model loading and inference before any main-shell route is migrated.

## What is implemented

- Dedicated `/local-ai-lab.html`; it must be excluded from the normal Pages Functions middleware so the main OVYX shell does not silently inject provider-dependent app scripts.
- WebLLM is pinned to `@mlc-ai/web-llm@0.2.86`. It is dynamically imported only after a person explicitly activates “Download and start local AI”.
- The selected Qwen3.5-4B q4f16_1 model is the primary candidate (approx. 2.39 GB files, registry reports approx. 3.87 GB GPU memory). Qwen3.5-2B q4f16_1 is a manually selected lower-resource comparison (approx. 1.08 GB files, approx. 2.25 GB GPU memory).
- The page checks WebGPU and site-storage estimates, checks the pinned runtime registry/cache, displays runtime initialization progress, supports cancellation, allows retry, streams model output, supports interrupt/unload and keeps a bounded in-memory conversation.
- The dedicated prototype has no OVYX API calls, account auth, project context, saved chat history, project write tools or hosted model fallback. The current main OVYX engine and its safety controls remain untouched.
- Local model artifacts/runtime are downloaded only after user opt-in. Public file/runtime hosts provide code/model artifacts; prompts must remain local.

## Compatibility evidence

The official WebLLM `v0.2.86` source registry lists `Qwen3.5-4B-q4f16_1-MLC` and references `web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`; that versioned WASM path exists in the official MLC binary library tree. Registry values show a 4,096-token configured context and approximately 3.87 GB GPU memory. Source/asset compatibility alone is not proof of a successfully loaded model or good quality.

## Open Stage 3 acceptance gates

- [ ] Static contract and real-browser regression passes on desktop and mobile viewports.
- [ ] In a real browser, an explicit model load downloads files, reports actual progress and completes without mock fixtures.
- [ ] A genuine prompt gets a response from the local model. Record browser/device/OS, GPU/WebGPU status, runtime version, selected model, download duration/size, time to first token, total response time and any memory/device errors.
- [ ] Reopening/reloading reuses the valid model cache; cleared/evicted cache, interrupted download, low storage and failed network downloads recover clearly.
- [ ] Cancellation works during download/initialization and during generation; no stuck state or endless spinner.
- [ ] Network capture shows prompt text and project data do not leave the browser for any hosted inference endpoint. Model/runtime artifact downloads are allowed, but prompts must not be sent to those hosts.
- [ ] Test on at least one actual target desktop and one actual target Android/mobile browser; a mocked Chromium test alone is insufficient.
- [ ] If the 4B model does not fit target device resources, manually compare 2B/0.8B; never automatically choose a cloud provider as a fallback.
- [ ] Fix the prototype wording and error behavior based on observed tests before marking Stage 3 complete.

## Free/independence definition

This path aims to avoid per-prompt hosted model API charges after model files are downloaded. It is not unlimited compute or universally free in every sense: users spend data/storage to download weights and their device spends memory, GPU/CPU, battery and time. Unsupported browsers must be told honestly and must not silently send prompts to a hosted provider.

## Exit decision

No current OVYX assistant, Web Studio, App Studio or Agent generation route is migrated at this stage. Stage 4 benchmarks real model intelligence after Stage 3 proves that it can load and answer on the intended devices. Stages 5–11 remain in the original user-defined order.
