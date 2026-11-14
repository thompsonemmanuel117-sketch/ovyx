import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { HttpsError } from 'firebase-functions/v2/https';
import { isAllowedNewAccountProvider } from './policy.js';

// This runs before Firebase creates a new Auth user. Existing Google/GitHub
// accounts are unaffected because beforeUserCreated does not run on sign-in.
export const restrictUnregisteredSocialAccounts = beforeUserCreated((event) => {
  const providerId = String(event.credential?.providerId || '').trim().toLowerCase();

  if (isAllowedNewAccountProvider(providerId)) return;

  throw new HttpsError(
    'permission-denied',
    'Google/GitHub sign-in is only available for existing OVYX accounts. Use the explicit email/password Create Account flow first.',
  );
});
