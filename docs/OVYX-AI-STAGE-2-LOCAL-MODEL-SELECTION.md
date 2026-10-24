# OVYX AI Stage 2 — Local Model Selection

**Status:** Selection decision recorded; not yet a quality/production acceptance result  
**Decision date:** 2026-10-24  
**Scope:** Choose the first model/runtime candidate for a browser-local OVYX AI prototype. No generation routes are migrated by this document.

## Decision

Use **Qwen3.5-4B, MLC quantization `q4f16_1`** as the first Stage 3 browser-local prototype candidate:

- Model artifacts: [`mlc-ai/Qwen3.5-4B-q4f16_1-MLC`](https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC)
- Upstream model card/license: [`Qwen/Qwen3.5-4B`](https://huggingface.co/Qwen/Qwen3.5-4B)
- Model package size observed in the MLC model listing: **2.39 GB**. Treat this as an approximate model download size; browser cache overhead, runtime assets, and inference memory are additional.
- The upstream Qwen3.5-4B model card lists the **Apache-2.0** license. Preserve the applicable upstream and quantized-artifact notices when packaging or downloading model assets.

This is a **prototype candidate**, not a claim that it already outperforms OVYX's existing providers. It is a compromise for local inference on supported user devices: small enough to test in a browser, large enough to give the prototype a reasonable starting point, and does not require a paid hosted inference endpoint for each prompt. It is a general Qwen3.5 model, not a coding-specialized checkpoint, so Stage 4 must prove whether it is good enough for actual website and app generation.

## Why not start with the strongest coding model?

The official [Qwen3-Coder-Next GGUF model card](https://huggingface.co/Qwen/Qwen3-Coder-Next-GGUF) describes an agentic coding model with 80B total parameters and 3B activated parameters, but its published Q4_K_M artifact is about **48.4 GB**. Active parameters are not the same as total model storage: the full set of expert weights must still be available. This is not a realistic default browser download for OVYX's mobile-first audience.

The [Qwen3-Coder-30B-A3B-Instruct model card](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct) is a stronger coding-focused benchmark candidate (30.5B total / 3.3B active, 256K native context). Its full model or quantized builds are also too large for a normal browser-first download. Keep it as a **separate desktop/self-hosted benchmark target**, not as the first model downloaded to every OVYX user's device. Running this larger model on OVYX-controlled hardware would remove per-prompt third-party model API charges, but it would not remove the cost of hosting and operating the hardware.

## Browser runtime choice

Prototype against the open-source **MLC-LLM / WebLLM** path and its model/runtime configuration, rather than adding a cloud-inference SDK. The MLC artifact listing identifies the Qwen3.5-4B quantized model as an MLC model and the MLC model catalogue lists Qwen3.5 2B, 4B and 9B variants.

- 4B candidate: [MLC Qwen3.5-4B q4f16_1, 2.39 GB](https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC)
- Lower-resource comparison: [MLC Qwen3.5-2B q4f32_1, 1.08 GB](https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f32_1-MLC)
- Higher-resource comparison: [MLC Qwen3.5-9B q4f16_1, 5.06 GB](https://huggingface.co/mlc-ai/Qwen3.5-9B-q4f16_1-MLC)
- Runtime reference: [MLC WebLLM project](https://github.com/mlc-ai/web-llm) and [MLC models catalogue](https://huggingface.co/mlc-ai/models)

**Runtime compatibility was verified against the pinned WebLLM release on 2026-10-24.** The official WebLLM `v0.2.86` source registry includes the exact `Qwen3.5-4B-q4f16_1-MLC` model ID, and its model-library path points to `web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`, which also exists in the official MLC binary library repository. The registry reports approximately **3.87 GB GPU memory** and a 4,096-token configured context for this record.

That is source/asset compatibility evidence, not a successful in-browser model-load result. Stage 3 must load the actual model, produce an actual local answer, and record browser/device/memory/latency evidence. If 4B cannot run acceptably on target devices, explicitly test the 2B or 0.8B local alternatives. Do not silently substitute a hosted model or claim device support from the registry record alone.

The runtime is pinned to WebLLM `0.2.86` for the prototype and must not float to a latest CDN release. If OVYX changes the runtime, re-check the registered model ID, model-library version, WASM path and license before using it.
## Constraints we must tell the truth about

“Free and unlimited” can only mean **no per-prompt external AI-provider bill when a user is running the model locally**. It cannot honestly mean unlimited speed, unlimited memory, unlimited context, or the same intelligence as a large hosted frontier model.

1. Model weights must be downloaded. The initial 2.39 GB transfer can be expensive on mobile data; do not auto-download it on page load. Show the user model size, require an explicit download/start action, display progress, allow cancellation, and reuse a valid cached copy.
2. Browser-local inference requires supported WebGPU and enough device memory/storage. WebGPU is not available on every device/browser. Detect capability before offering the model; display a clear unsupported/low-memory state instead of a frozen spinner.
3. Model inference consumes the user's device resources: memory, battery, heat, and compute time. Avoid blocking the UI thread; use a worker where supported and maintain bounded context/output.
4. Model downloads may use a public model-hosting URL. User prompts and project files must remain in the browser for local inference; do not send them to model hosting or an external inference API. Verify this with network-capture tests.
5. If a device cannot run the model, the local prototype must report that limitation. There must be **no hidden fallback to Gemini, OpenAI, Anthropic, DeepSeek, Groq, OpenRouter, or Cloudflare Workers AI**. Any later hosted/self-hosted option must be explicit and separately labeled.

References:
- [Qwen3.5-4B official model card](https://huggingface.co/Qwen/Qwen3.5-4B)
- [MLC Qwen3.5-4B quantized files and size](https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC)
- [MLC quantized 2B model and size](https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f32_1-MLC)
- [MLC quantized 9B model and size](https://huggingface.co/mlc-ai/Qwen3.5-9B-q4f16_1-MLC)
- [Qwen3-Coder-Next model card and Q4_K_M size](https://huggingface.co/Qwen/Qwen3-Coder-Next-GGUF)
- [Qwen3-Coder-30B-A3B-Instruct model card](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)
- [Hugging Face Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [MLC WebLLM](https://github.com/mlc-ai/web-llm)

## Stage 3 go/no-go checklist

The following must pass before any current AI path is migrated:

- [ ] Pin a reproducible WebLLM/MLC runtime version; inspect `prebuiltAppConfig.model_list`; determine whether Qwen3.5-4B needs a custom record/build; verify actual load in supported Chromium desktop and Android/mobile browsers. If that fails, test the Qwen3-4B MLC local alternative. Artifact availability alone is not runtime proof.
- [ ] Show capability, required download size, model-download progress, cache status, cancel, retry, and low-storage/network errors.
- [ ] Verify model cache reuse after reload and handle cleared/evicted storage gracefully.
- [ ] Stream tokens without UI freezes; test cancel while downloading, initializing, and generating.
- [ ] Test no-WebGPU and insufficient-memory devices; no indefinite spinner and no silent external fallback.
- [ ] Use network capture to prove that prompt, project files, attachments, and conversation history are not sent to external model inference endpoints in local-only mode.
- [ ] Keep existing sign-in, authorization, quota accounting, history, project safe-write, destructive confirmation, rollback/recovery, and provider paths unchanged until separately tested.
- [ ] Expose an explicit **Local AI** mode and accurately identify model/runtime/limitations; do not label the current provider-routed engine as local.
- [ ] Hand the same benchmark prompts to the local model and record real outputs, latency, errors, memory/device details, generated project build results, and desktop/mobile interaction checks in Stage 4.

## Stage exit decision

**Stage 2 status: COMPLETE — candidate selected and recorded.** It is **not** permission to replace the current routes. Stage 3 is a reversible, isolated local-inference prototype; Stage 4 measures real output quality. If the 4B model fails the website-generation bar, retain the evidence and compare the 9B local option and the larger self-hosted coder model before any migration.
