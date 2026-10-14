# OVYX Firebase Auth account-creation guard

This isolated Firebase Functions v2 package prevents Firebase from creating a new account through Google, GitHub, or another non-password provider. New email/password accounts created through OVYX's explicit **Create Account** flow remain allowed. Existing Google/GitHub accounts continue to sign in because this trigger only runs before a new Firebase Auth user is created.

## Important activation requirement

**This policy is not active until the function is deployed to the same Firebase project used by OVYX.** Firebase Authentication blocking functions require the project to use Firebase Authentication with Identity Platform. The Cloudflare Pages runtime cannot enforce this provider-creation rule on its own.

1. Confirm the Firebase project used by the deployed OVYX site.
2. Confirm/enable Identity Platform for that project and review any billing implications in Firebase/Google Cloud first.
3. From this directory, install dependencies and deploy only this codebase:

   `npm install`

   `firebase deploy --only functions:restrictUnregisteredSocialAccounts --config firebase.json --project YOUR_FIREBASE_PROJECT_ID`

4. Test all cases with dedicated test accounts: email/password registration succeeds; an existing Google account signs in; an existing GitHub account signs in; a brand-new Google/GitHub account is rejected before Firebase creates it.

Do not deploy to a guessed Firebase project. This repo change does not modify Cloudflare environment variables or any AI provider API keys.
