// Canonical API path for the session-revocation endpoint.
// Keep the legacy /api/api/auth/revoke-sessions route available for older clients.
export { onRequestPost, onRequestGet } from '../api/auth/revoke-sessions.js';
