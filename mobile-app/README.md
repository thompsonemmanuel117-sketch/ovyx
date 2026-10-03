# OVYX Mobile Build Worker

This Expo/EAS project is the native wrapper used by OVYX App Studio. OVYX does not compile APK/IPA binaries inside Cloudflare Pages Functions; the backend dispatches an EAS Workflow, and the workflow fetches the signed Web Studio payload from `/api/mobile/build/payload` during the cloud build.

## One-time EAS setup

1. Create or link this `mobile-app/` directory to an Expo/EAS project and record the EAS project UUID.
2. Connect that EAS project to the Git repository/branch containing `.eas/workflows/ovyx-mobile-build.yml`.
3. Create a scoped Expo/EAS token for the backend and store it as `EXPO_TOKEN` in Cloudflare Pages/Functions secrets.
4. Store `EXPO_PROJECT_ID` and `OVYX_MOBILE_PAYLOAD_SECRET` in Cloudflare Pages/Functions secrets/variables.
5. Add `OVYX_PUBLIC_BASE_URL` to the EAS `preview` environment so the build worker can fetch the signed payload endpoint.
6. Add `OVYX_MOBILE_BUILD_PAYLOAD_SECRET` to the EAS `preview` environment with the same value used by Cloudflare.
7. Create a BUILD webhook pointing at `https://<OVYX_PUBLIC_BASE_URL>/api/mobile/eas-webhook` and protect it with `EXPO_WEBHOOK_SECRET` in Cloudflare.

Example webhook command:

`eas webhook:create --event BUILD --url https://<OVYX_PUBLIC_BASE_URL>/api/mobile/eas-webhook --secret <EXPO_WEBHOOK_SECRET>`

The backend dispatch uses EAS Workflows REST. The workflow returns build IDs while the signed webhook writes the final artifact URLs to the authenticated user's OVYX build record.

## Signing

Android preview APK builds use EAS-managed signing credentials. iOS builds require the EAS project to have valid Apple Developer credentials/configuration. OVYX intentionally does not inject or distribute a shared debug keystore or fabricate unsigned IPA/APK links.
