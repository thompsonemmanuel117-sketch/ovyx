# OVYX Sentinel 3D Human Guardian

OVYX Sentinel's eye icon remains as a safe fallback, while the private administrator panel can render a full-body, dressed 3D human character.

## Model and licence

- Model: [Businessman 01](https://models.codelove.in/models/business-male-01/)
- Source model URL: `https://models.codelove.in/models/business-male-01.glb`
- Model: 80-bone rigged male business character, approximately 792 KB.
- Licence: MIT (the model provider says to keep its included licence when shipping or sharing the model).
- Animation source: [models.codelove.in animation library](https://models.codelove.in/animations/), with separate idle, talking and wave GLB clips.

The browser loads the model and clips from the listed source and Three.js modules from a pinned CDN version. If any external asset is unavailable, the Sentinel voice panel continues to work and shows a visible fallback status.

## Voice and privacy

- The 3D runtime synchronizes the talking animation with Sentinel's existing browser speech synthesis.
- It does not create a second microphone listener or enable camera access.
- Wake-word listening remains an explicit user action in the existing Sentinel controls and only works while the page is open and active.
- The guardian remains restricted to the verified owner interface; the avatar does not expose reports or account data to other users.
- The existing AI route and scheduled monitoring are unchanged. The avatar is presentation only and does not gain permission to modify code, secrets, or deployments.

## Limitations

The initial character is a professional human avatar, not a custom photorealistic scan. Natural speech depends on voices available in the user's browser/device, and voice recognition depends on browser support and permission.
