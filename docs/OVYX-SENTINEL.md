# OVYX Sentinel

OVYX Sentinel is an administrator-only operational health monitor. It checks the app shell, platform health, service configuration, and assistant assets. Reports store status codes, durations, and allowlisted error codes only; they do not store private user content, source files, prompts, or credentials.

The Pages API supports administrator-triggered scans. Scheduled scans require a separate Cloudflare Worker with a Cron Trigger. That Worker is not deployed merely by merging this Pages repository; configure its site URL and a strong shared secret in Cloudflare before relying on background checks.

The optional wake word is disabled until an administrator explicitly enables it and grants microphone permission. Supported browsers can listen while OVYX is open and active; background browser throttling and closed-browser wake-up are not guaranteed. The user can pause or disable listening at any time. Browser speech synthesis reads the assistant response aloud when supported.

Sentinel does not secretly inspect users' private projects, files, or conversations. Its built-in checks are limited to operational endpoints and optionally read-only GitHub Actions status. A healthy report is evidence for the checks listed, not proof that every feature works.