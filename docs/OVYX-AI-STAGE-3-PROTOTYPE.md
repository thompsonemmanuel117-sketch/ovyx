# OVYX AI — Stage 3: Browser-local inference prototype

**Status:** Implementation in progress; not accepted  
**Branch:** `feat/stage-3-browser-local-ai-prototype`  
**Scope:** A small isolated page to prove real browser-local model loading and inference before any main-shell route is migrated.

## What is implemented

- Dedicated `/local-ai-lab.html` is explicitly excluded from the main Pages middleware under both the `.html` URL and Cloudflare's canonical extensionless `/local-ai-lab` route. Both URL forms carry the COOP/COEP isolation headers; the main OVYX shell must not inject provider-dependent workspace scripts.
- WebLLM is pinned to `@mlc-ai/web-llm@0.2.86`. Runtime code is dynamically imported only after the person explicitly activates “Download and start local AI”.
- Qwen3.5-4B `q4f16_1` is the primary candidate (about 2.39 GB model files; WebLLM registry estimates about 3.87 GB GPU memory). Qwen3.5-2B `q4f32_1` is an optional manual comparison (about 1.08 GB files; registry estimates about 2.59 GB GPU memory).
- The official WebLLM registry includes both selected model IDs. The prototype pins Qwen model-artifact revisions (`44b4246` for 4B and `d835e5c` for 2B) and the compiled MLC library to repository commit `00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0`; it passes the same pinned app configuration to cache checks and engine initialization.
- The page checks WebGPU and site-storage estimates, checks runtime registration/cache, displays progress, supports cancel/retry, streams response tokens, supports interrupt/unload, and bounds the in-memory conversation and prompt context.
- The dedicated prototype has no OVYX AI API calls, account auth, project context, saved server-side history, project write tools or hosted inference fallback. Existing main OVYX AI routes and their safeguards remain untouched.
- Runtime/model artifacts are downloaded only after explicit opt-in. Public runtime/model hosts may serve the code and weights; prompts must remain local.

## Compatibility evidence

The official WebLLM `v0.2.86` source registry lists `Qwen3.5-4B-q4f16_1-MLC` and `Qwen3.5-2B-q4f32_1-MLC`. The pinned 4B model-library path is `web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`, which exists in the official MLC binary library tree at the pinned commit. The registry records a 4,096-token configured context and about 3.87 GB GPU memory for the 4B model. The browser contract test checks that the app config passed to WebLLM carries the expected pinned artifact/library URLs. This is source/config and mocked-browser evidence only—not a real successful model download/load, answer, latency measurement or quality result.

## Open Stage 3 acceptance gates

- [x] Current static contract and mocked-browser regression workflow passes on desktop and mobile viewports (GitHub Actions run [40098583799](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40098583799), commit `3dd5210a3f3f762775954cd1a9f7d6f1bc9a3043`). These tests validate UI and isolation contracts, not real inference.
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
