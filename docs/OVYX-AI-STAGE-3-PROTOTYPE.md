# OVYX AI — Stage 3: Browser-local inference prototype

**Status:** Explicit CPU/WASM model option is being integrated into the isolated lab; end-to-end acceptance is pending CI results and real target-device checks. The earlier CPU feasibility experiment is evidence of a workable runtime, not proof that the integrated lab passes.  
**Current development branch:** `feat/stage3-cpu-wasm-local-lab`  
**Original prototype branch:** `feat/stage-3-browser-local-ai-prototype`  
**Scope:** A small isolated page to prove real browser-local model loading and inference before any main-shell route is migrated.

## What is implemented

- Dedicated `/local-ai-lab.html` is explicitly excluded from the main Pages middleware under both the `.html` URL and Cloudflare's canonical extensionless `/local-ai-lab` route. Both URL forms carry the COOP/COEP isolation headers; the main OVYX shell must not inject provider-dependent workspace scripts.
- WebLLM is pinned to `@mlc-ai/web-llm@0.2.86`. Runtime code is dynamically imported only after the person explicitly activates “Download and start local AI”.
- Qwen3.5-4B `q4f16_1` is the primary candidate (about 2.39 GB model files; WebLLM registry estimates about 3.87 GB GPU memory). Qwen3.5-2B `q4f32_1` is a manual medium-resource comparison (about 1.08 GB files; registry estimates about 2.59 GB GPU memory). Qwen3.5-0.8B `q4f16_1` is included as the lowest-resource comparison (about 447 MB files; registry estimates about 1.63 GB GPU memory). These are estimates; actual device compatibility has not yet been proven.
- The official WebLLM `v0.2.86` registry includes all three model IDs. The prototype pins model-artifact revisions (`44b4246` for 4B, `d835e5c` for 2B and `0ec1389` for 0.8B) and the compiled MLC library to repository commit `00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0`; it passes the same pinned app configuration to cache checks and engine initialization.
- The page checks WebGPU and site-storage estimates, checks runtime registration/cache, displays progress, supports cancel/retry, streams response tokens, supports interrupt/unload, and bounds the in-memory conversation and prompt context. A user-triggered diagnostic record collects browser/GPU capability, storage, load duration, first-token latency and response duration while excluding all prompt/answer content; it is not transmitted automatically.
- A separate, explicitly selected `Qwen2.5-0.5B-Instruct` CPU/WASM option is being added to the same isolated lab. It uses Transformers.js 4.3.1 with a pinned model revision and q8 ONNX weights, reports download progress, streams local output, terminates its worker on Stop, and relies on the browser Cache API for reuse. This smaller Qwen2.5 model is a practical compatibility path, not a replacement for the Stage 2 Qwen3.5 candidate and not yet quality-certified. There is no automatic model swap or hosted fallback.
- The dedicated prototype has no OVYX AI API calls, account auth, project context, saved server-side history, project write tools or hosted inference fallback. Existing main OVYX AI routes and their safeguards remain untouched.
- Runtime/model artifacts are downloaded only after explicit opt-in. Public runtime/model hosts may serve the code and weights; prompts must remain local.

## Compatibility evidence

The official WebLLM `v0.2.86` source registry lists `Qwen3.5-4B-q4f16_1-MLC`, `Qwen3.5-2B-q4f32_1-MLC` and `Qwen3.5-0.8B-q4f16_1-MLC`. The pinned 4B model-library path is `web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`, which exists in the official MLC binary library tree at the pinned commit. The registry records a 4,096-token configured context and about 3.87 GB GPU memory for the 4B model. The browser contract test checks that the app config passed to WebLLM carries the expected pinned artifact/library URLs. This is source/config and mocked-browser evidence only—not a real successful model download/load, answer, latency measurement or quality result.

## Open Stage 3 acceptance gates

- [x] Current static contract and mocked-browser regression workflow passes on desktop and mobile viewports, including the 0.8B model configuration and privacy-safe diagnostics export (GitHub Actions run [40099426120](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40099426120), code commit `5beb2aa45504fd8f37f4057f25f07114618c62f8`). These tests validate UI and isolation contracts, not real inference.
- [x] A separate evaluation-only browser run generated a genuine answer with `onnx-community/Qwen2.5-0.5B-Instruct`, Transformers.js 4.3.1 and CPU/WASM, with no hosted inference API request observed. Evidence: [CPU/WASM feasibility workflow run](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40101497403). The same smaller model is now being explicitly integrated into the isolated lab; integration and its end-to-end acceptance still require the new real-lab smoke test below. It is not the Stage 2 Qwen3.5 model and does not establish quality.
- [ ] In the user-facing lab, a real CPU/WASM model load downloads weights, reports actual progress and generates genuine output through the UI; then reload and prove that cached weights are reused, Stop releases the worker, and browser network capture shows no prompt egress or hosted inference calls. The earlier standalone CPU experiment does not complete this gate until the integrated test passes.
- [ ] The separate WebGPU path passes a real load and inference test on a compatible browser/device. The first automated WebGPU attempt selected Qwen3.5-0.8B and failed during shader compilation in the headless CI GPU adapter; see [real WebGPU smoke run](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40100482123). This is an environment/model-runtime compatibility failure, not evidence that the model fails on every real device. Do not hide this failure or silently switch models.
- [ ] A genuine prompt gets a response from the local model. Record browser/device/OS, GPU/WebGPU status, runtime version, selected model, download duration/size, time to first token, total response time and any memory/device errors.
- [ ] Reopening/reloading the user-facing lab reuses the valid model cache; cleared/evicted cache, interrupted download, low storage and failed network downloads recover clearly. The integrated CPU/WASM real-lab smoke test is being extended to verify cache behavior after reload; its pass/fail result will be recorded before this gate is closed.
- [ ] Cancellation works during download/initialization and during generation; no stuck state or endless spinner.
- [ ] Network capture shows prompt text and project data do not leave the browser for any hosted inference endpoint. Model/runtime artifact downloads are allowed, but prompts must not be sent to those hosts.
- [ ] Test on at least one actual target desktop and one actual target Android/mobile browser; a mocked Chromium test alone is insufficient.
- [ ] If the 4B model does not fit target device resources, manually compare 2B and 0.8B; never automatically choose another model or a cloud provider as a fallback.
- [ ] Confirm the device-local diagnostic record matches real observed runs. Fix any download, cache, cancellation, performance, privacy or misleading-status problems found before marking Stage 3 complete.

## Free/independence definition

This path aims to avoid per-prompt hosted model API charges after model files are downloaded. It is not unlimited compute or universally free in every sense: users spend data/storage to download weights and their device spends memory, GPU/CPU, battery and time. Unsupported browsers must be told honestly and must not silently send prompts to a hosted provider.

## Exit decision

No current OVYX assistant, Web Studio, App Studio or Agent generation route is migrated at this stage. Stage 4 benchmarks real model intelligence after Stage 3 proves that it can load and answer on the intended devices. Stages 5–11 remain in the original user-defined order.
