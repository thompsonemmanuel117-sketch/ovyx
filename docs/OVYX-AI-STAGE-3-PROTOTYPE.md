# OVYX AI — Stage 3: Browser-local inference prototype

**Status:** The isolated CPU/WASM path now passes genuine end-to-end CI acceptance: model download, real local response, persistent OPFS weight reuse after reload, generation stop and no prompt egress. Desktop/mobile browser regressions also cover CPU-load cancellation. Stage 3 remains open for real target-device validation and a genuine WebGPU/Qwen3.5 load.  
**Current development branch:** `feat/stage3-cpu-wasm-local-lab`  
**Original prototype branch:** `feat/stage-3-browser-local-ai-prototype`  
**Scope:** A small isolated page to prove real browser-local model loading and inference before any main-shell route is migrated.

## What is implemented

- Dedicated `/local-ai-lab.html` is explicitly excluded from the main Pages middleware under both the `.html` URL and Cloudflare's canonical extensionless `/local-ai-lab` route. Both URL forms carry the COOP/COEP isolation headers; the main OVYX shell must not inject provider-dependent workspace scripts.
- WebLLM is pinned to `@mlc-ai/web-llm@0.2.86`. Runtime code is dynamically imported only after the person explicitly activates “Download and start local AI”.
- Qwen3.5-4B `q4f16_1` is the primary candidate (about 2.39 GB model files; WebLLM registry estimates about 3.87 GB GPU memory). Qwen3.5-2B `q4f32_1` is a manual medium-resource comparison (about 1.08 GB files; registry estimates about 2.59 GB GPU memory). Qwen3.5-0.8B `q4f16_1` is included as the lowest-resource comparison (about 447 MB files; registry estimates about 1.63 GB GPU memory). These are estimates; actual device compatibility has not yet been proven.
- The official WebLLM `v0.2.86` registry includes all three model IDs. The prototype pins model-artifact revisions (`44b4246` for 4B, `d835e5c` for 2B and `0ec1389` for 0.8B) and the compiled MLC library to repository commit `00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0`; it passes the same pinned app configuration to cache checks and engine initialization.
- The page checks WebGPU and site-storage estimates, checks runtime registration/cache, displays progress, supports cancel/retry, streams response tokens, supports interrupt/unload, and bounds the in-memory conversation and prompt context. A user-triggered diagnostic record collects browser/GPU capability, storage, load duration, first-token latency and response duration while excluding all prompt/answer content; it is not transmitted automatically.
- A separate, explicitly selected `Qwen2.5-0.5B-Instruct` CPU/WASM option is integrated into the same isolated lab. It uses Transformers.js 4.3.1 with a pinned model revision and q8 ONNX weights, reports download progress, streams local output, terminates its worker on Stop, and stores complete model files in streaming OPFS storage. It also serves the runtime's one-byte weight probe from the cached file after reload and rewrites mutable `resolve/main` aliases to the pinned revision before network access. This smaller Qwen2.5 model is a practical compatibility path, not a replacement for the Stage 2 Qwen3.5 candidate and not yet quality-certified. There is no automatic model swap or hosted fallback.
- The dedicated prototype has no OVYX AI API calls, account auth, project context, saved server-side history, project write tools or hosted inference fallback. Existing main OVYX AI routes and their safeguards remain untouched.
- Runtime/model artifacts are downloaded only after explicit opt-in. Public runtime/model hosts may serve the code and weights; prompts must remain local.

## Compatibility evidence

The official WebLLM `v0.2.86` source registry lists `Qwen3.5-4B-q4f16_1-MLC`, `Qwen3.5-2B-q4f32_1-MLC` and `Qwen3.5-0.8B-q4f16_1-MLC`. The pinned 4B model-library path is `web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`, which exists in the official MLC binary library tree at the pinned commit. The registry records a 4,096-token configured context and about 3.87 GB GPU memory for the 4B model. The browser contract test checks that the app config passed to WebLLM carries the expected pinned artifact/library URLs. This is source/config and mocked-browser evidence only—not a real successful model download/load, answer, latency measurement or quality result.

## Open Stage 3 acceptance gates

- [x] Current desktop/mobile regression workflow passes, including the 0.8B model configuration, privacy-safe diagnostics, and CPU initialization cancellation (GitHub Actions run [40106223918](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40106223918)). The older [run 40099426120](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40099426120) also established the original UI/isolation contract. Mocked browser tests do not replace physical-device evidence.
- [x] The integrated user-facing CPU/WASM lab passes a genuine model load, real local response, OPFS weight persistence/reload, generation stop and prompt-egress/hosted-inference checks. Evidence: [real CPU/WASM lab acceptance run](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40106098693). This uses the explicitly selected `onnx-community/Qwen2.5-0.5B-Instruct` model, not the Stage 2 Qwen3.5 candidate, and does not establish answer quality.
- [x] Desktop and mobile Chromium regression checks pass for the isolated lab, including CPU model initialization cancellation and generation stop: [browser regression run](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40106223918). This is UI/worker contract evidence, not physical-device evidence.
- [ ] The separate WebGPU path passes a real load and inference test on a compatible browser/device. The first automated WebGPU attempt selected Qwen3.5-0.8B and failed during shader compilation in the headless CI GPU adapter; see [real WebGPU smoke run](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40100482123). This is an environment/model-runtime compatibility failure, not evidence that the model fails on every real device. Do not hide this failure or silently switch models.
- [x] A genuine prompt gets a response from the local CPU/WASM model in the user-facing lab; the sanitized CI report records browser/OS, runtime, selected model and timing without storing prompts or answers. Physical-device metrics remain open below.
- [x] Reloading the user-facing lab reuses the complete OPFS-cached ONNX weight without another full model-weight GET (verified in [run 40106098693](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40106098693)).
- [ ] Recovery from cleared/evicted cache, interrupted download, low storage and failed network downloads still needs explicit acceptance tests.
- [x] Cancellation is covered for CPU model initialization in desktop/mobile browser regression tests and for active CPU generation in the real-lab acceptance run; no stuck state was observed in those runs.
- [x] Real-lab network capture found no prompt egress and no hosted inference endpoint call during CPU/WASM inference. Model/runtime artifact downloads are allowed; prompts remain local in the tested workflow.
- [ ] Test on at least one actual target desktop and one actual target Android/mobile browser; a mocked Chromium test alone is insufficient.
- [ ] If the 4B model does not fit target device resources, manually compare 2B and 0.8B; never automatically choose another model or a cloud provider as a fallback.
- [ ] Confirm the device-local diagnostic record matches real observed runs. Fix any download, cache, cancellation, performance, privacy or misleading-status problems found before marking Stage 3 complete.

## Free/independence definition

This path aims to avoid per-prompt hosted model API charges after model files are downloaded. It is not unlimited compute or universally free in every sense: users spend data/storage to download weights and their device spends memory, GPU/CPU, battery and time. Unsupported browsers must be told honestly and must not silently send prompts to a hosted provider.

## Exit decision

No current OVYX assistant, Web Studio, App Studio or Agent generation route is migrated at this stage. Stage 4 benchmarks real model intelligence after Stage 3 proves that it can load and answer on the intended devices. Stages 5–11 remain in the original user-defined order.
