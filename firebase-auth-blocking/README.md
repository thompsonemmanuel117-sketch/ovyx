# OVYX Firebase Auth account-creation guard

This isolated Firebase Functions v2 package prevents Firebase from creating a new Auth account through Google, GitHub, or another non-password provider. New email/password accounts made through OVYX's explicit **Create Account** flow remain allowed. Existing Google/GitHub accounts continue to sign in because this blocking trigger runs before account creation, not during sign-in.

## Activation requirement

**This server-side policy is not active until the function is deployed to the same Firebase project used by OVYX.** Firebase Authentication blocking functions require Firebase Authentication with Identity Platform enabled. Do not deploy to a guessed project or enable a billable feature without reviewing the project first.

1. Confirm the Firebase project ID used by the live OVYX site and confirm Identity Platform is enabled.
2. From this directory, run `npm install`.
3. Deploy only this function with `firebase deploy --only functions:restrictUnregisteredSocialAccounts --config firebase.json --project YOUR_FIREBASE_PROJECT_ID`.
4. Verify that email/password account creation succeeds, while a brand-new Google/GitHub user is rejected before account creation and existing provider-linked accounts still sign in.

This repository change does not change Cloudflare Pages settings, Cloudflare secrets, or any AI provider key.
