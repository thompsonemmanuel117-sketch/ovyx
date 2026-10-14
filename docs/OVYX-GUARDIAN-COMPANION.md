# OVYX Guardian — voice-first owner companion

OVYX Guardian is the private, administrator-only presentation and conversation layer for the existing OVYX Sentinel health checks, AI diagnosis, repository investigation, and guarded code-fix review workflows. The dressed 3D human avatar is an interface/animation layer; it does not grant additional server privileges.

## Talking and waking it

1. Sign in with the verified root administrator account.
2. Open Guardian from its launcher.
3. Select **Enable wake word** and grant microphone permission when the browser asks. Say **“OVYX”** to wake it, then speak naturally. While awake, it can continue listening for follow-up turns after its spoken reply.
4. Say **“OVYX, open Web Studio”**, **“OVYX, open AI Assistant Workspace”**, **“OVYX, open Admin Pricing”**, **“OVYX, check now”**, or **“OVYX, prepare a code fix”** to ask for supported navigation or Guardian actions.
5. Say **“go to sleep”** to hide Guardian while leaving the explicitly enabled wake listener active, or **“stop listening”** to switch the microphone off completely. A sleeping Guardian can also be opened manually when wake-word listening is off.

Speech recognition and speech synthesis are browser/device features. Availability, accent accuracy and voice quality vary. Wake-word listening works only while the OVYX page remains open and active in a supported browser; it cannot listen while the tab/browser is closed, and it is not an operating-system-level always-on assistant. Users must opt into microphone access. Camera access remains disabled. If speech recognition is unsupported or microphone access is denied, use the text box or the existing buttons.

## Conversation privacy and AI configuration

- The dedicated /api/admin/sentinel-companion endpoint accepts only authenticated root-administrator requests, enforces same-origin requests, and allows only the chat action.
- Conversation memory is held in the active page's JavaScript memory and limited to the recent turns. It is not written to Firestore/chat history by this endpoint; a page reload clears the session transcript.
- The server sends a bounded set of recent messages and, when available, a small sanitized summary of the latest saved operational check to the configured OVYX AI provider. The endpoint uses the existing provider router and native Workers AI fallback when available. It does not silently read API key values or private end-user projects/conversations.
- If AI providers are unavailable, Guardian should say so. It must not imply that it completed a scan, inspected source code, changed files, or deployed a release without evidence of that action.

## What commands can do

- Recognized navigation routes map to an explicit list of OVYX pages. Admin pages use the existing root-owner route guard. A limited fallback can click an unambiguous, visible, safe-to-open control; it excludes destructive, publishing, billing, credential and account-changing actions.
- “Check now” runs the existing Sentinel health checks. “AI diagnosis” analyses the latest saved sanitized report; it is not a live repository review.
- Source-level questions may use the optional read-only GitHub investigator if its separate, least-privilege read token is configured. If that integration is unavailable, Guardian must say that source was not inspected.
- Code repair stays behind the separate proposal/preview flow. Creating a pull request requires an explicit confirmation phrase and configured patch storage/write permissions. Guardian must not write to main, merge a PR, deploy, or create/change/delete Cloudflare secrets automatically.

## Honest limitations

Guardian is not guaranteed to outperform Claude, ChatGPT, or the model/provider connected to OVYX. Actual capability depends on the selected model, configured keys, service permissions, quotas, source access, and external availability. Provider status checks have the limits documented in OVYX Sentinel. A healthy endpoint does not guarantee every model, action, or user workflow will work. The avatar assets are hosted externally; if they cannot load, the voice/control panel must still work and show a visible fallback.
