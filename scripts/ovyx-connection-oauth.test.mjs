import assert from 'node:assert/strict';
import {
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  getOAuthClientConfig,
  getOAuthProvider,
  getOAuthService,
  identifyOAuthAccount,
  refreshOAuthCredential,
  OAUTH_SERVICE_IDS
} from '../functions/_lib/connection-oauth.js';
import { onRequest } from '../functions/api/settings/connection-oauth.js';
import { onRequest as oauthCallbackRoute } from '../functions/api/settings/connection-oauth/callback.js';

const redirectUri = 'https://app.ovyx.example/api/settings/connection-oauth/callback';
const env = {
  OVYX_CONNECTION_OAUTH_REDIRECT_URI:redirectUri,
  OVYX_CONNECTION_OAUTH_GOOGLE_CLIENT_ID:'google-client-id',
  OVYX_CONNECTION_OAUTH_GOOGLE_CLIENT_SECRET:'google-client-secret',
  OVYX_CONNECTION_OAUTH_DISCORD_CLIENT_ID:'discord-client-id',
  OVYX_CONNECTION_OAUTH_DISCORD_CLIENT_SECRET:'discord-client-secret',
  OVYX_CONNECTION_OAUTH_NOTION_CLIENT_ID:'notion-client-id',
  OVYX_CONNECTION_OAUTH_NOTION_CLIENT_SECRET:'notion-client-secret',
  OVYX_CONNECTION_OAUTH_SLACK_CLIENT_ID:'slack-client-id',
  OVYX_CONNECTION_OAUTH_SLACK_CLIENT_SECRET:'slack-client-secret'
};

assert.deepEqual(OAUTH_SERVICE_IDS, ['notion','slack','discord','googledrive','googlesheets','googlecalendar']);
assert.equal(getOAuthService('googledrive').provider, 'google');
assert.equal(getOAuthService('googlesheets').endpoint, 'https://sheets.googleapis.com/v4');
assert.equal(getOAuthService('googlecalendar').endpoint, 'https://www.googleapis.com/calendar/v3');
assert.equal(getOAuthService('salesforce'), null);
assert.equal(getOAuthProvider('notion').refresh, true);
assert.equal(getOAuthClientConfig('google', {}).configured, false);
assert.ok(getOAuthClientConfig('google', {}).missing.includes('OVYX_CONNECTION_OAUTH_GOOGLE_CLIENT_ID'));
assert.equal(getOAuthClientConfig('google', env).configured, true);
assert.equal(getOAuthClientConfig('discord', env).configured, true);
assert.equal(getOAuthClientConfig('notion', env).configured, true);
assert.equal(getOAuthClientConfig('slack', env).configured, true);

const googleUrl = new URL(buildOAuthAuthorizationUrl('googledrive', getOAuthClientConfig('google', env), 'state-1', 'challenge-1'));
assert.equal(googleUrl.origin, 'https://accounts.google.com');
assert.equal(googleUrl.searchParams.get('state'), 'state-1');
assert.equal(googleUrl.searchParams.get('code_challenge'), 'challenge-1');
assert.equal(googleUrl.searchParams.get('code_challenge_method'), 'S256');
assert.equal(googleUrl.searchParams.get('access_type'), 'offline');
assert.ok(googleUrl.searchParams.get('scope').includes('drive.file'));
assert.ok(!googleUrl.searchParams.get('scope').split(' ').includes('https://www.googleapis.com/auth/drive'));

const discordUrl = new URL(buildOAuthAuthorizationUrl('discord', getOAuthClientConfig('discord', env), 'state-2', 'challenge-2'));
assert.equal(discordUrl.origin, 'https://discord.com');
assert.equal(discordUrl.searchParams.get('code_challenge_method'), 'S256');
assert.ok(discordUrl.searchParams.get('scope').includes('identify'));

const slackUrl = new URL(buildOAuthAuthorizationUrl('slack', getOAuthClientConfig('slack', env), 'state-slack'));
assert.equal(slackUrl.origin, 'https://slack.com');
assert.ok(slackUrl.searchParams.get('scope').includes('chat:write'));

const notionUrl = new URL(buildOAuthAuthorizationUrl('notion', getOAuthClientConfig('notion', env), 'state-3'));
assert.equal(notionUrl.origin, 'https://api.notion.com');
assert.equal(notionUrl.searchParams.get('owner'), 'user');
assert.equal(notionUrl.searchParams.get('state'), 'state-3');

assert.deepEqual(await identifyOAuthAccount('notion', {
  access_token:'notion-access-token',
  workspace_id:'workspace-1',
  workspace_name:'Example workspace',
  owner:{ user:{ id:'notion-user-1', name:'Example User', person:{ email:'user@example.test' } } }
}), { id:'notion-user-1', name:'Example User', email:'user@example.test' });

const originalFetch = globalThis.fetch;
try {
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url:String(url), options };
    return new Response(JSON.stringify({ access_token:'provider-access-token', refresh_token:'provider-refresh-token', expires_in:3600, scope:'openid email profile' }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  const token = await exchangeOAuthCode('googledrive', getOAuthClientConfig('google', env), 'temporary-code', 'pkce-verifier');
  assert.equal(token.access_token, 'provider-access-token');
  assert.equal(captured.url, 'https://oauth2.googleapis.com/token');
  const form = new URLSearchParams(captured.options.body);
  assert.equal(form.get('code_verifier'), 'pkce-verifier');
  assert.equal(form.get('redirect_uri'), redirectUri);
  assert.equal(form.get('client_secret'), 'google-client-secret');
  const refreshed = await refreshOAuthCredential('google', getOAuthClientConfig('google', env), 'provider-refresh-token');
  assert.equal(refreshed.access_token, 'provider-access-token');
  const refreshForm = new URLSearchParams(captured.options.body);
  assert.equal(refreshForm.get('grant_type'), 'refresh_token');
  assert.equal(refreshForm.get('refresh_token'), 'provider-refresh-token');
  assert.equal(refreshForm.get('client_secret'), 'google-client-secret');
  globalThis.fetch = async (url, options) => {
    captured = { url:String(url), options };
    return new Response(JSON.stringify({ access_token:'notion-access-token', refresh_token:'notion-refresh-token', workspace_id:'workspace-1', workspace_name:'Workspace', owner:{ user:{ id:'notion-user' } } }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  const notionToken = await exchangeOAuthCode('notion', getOAuthClientConfig('notion', env), 'notion-code');
  assert.equal(notionToken.access_token, 'notion-access-token');
  assert.match(captured.options.headers.Authorization, /^Basic /);
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(captured.options.body).grant_type, 'authorization_code');
  assert.equal(JSON.parse(captured.options.body).redirect_uri, redirectUri);
  globalThis.fetch = async (url, options) => {
    captured = { url:String(url), options };
    return new Response(JSON.stringify({ access_token:'notion-access-refreshed', refresh_token:'notion-refresh-rotated' }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  const notionRefresh = await refreshOAuthCredential('notion', getOAuthClientConfig('notion', env), 'notion-refresh-token');
  assert.equal(notionRefresh.access_token, 'notion-access-refreshed');
  assert.match(captured.options.headers.Authorization, /^Basic /);
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(captured.options.body).grant_type, 'refresh_token');
  assert.equal(JSON.parse(captured.options.body).refresh_token, 'notion-refresh-token');
  globalThis.fetch = async (url, options) => {
    captured = { url:String(url), options };
    return new Response(JSON.stringify({ ok:true, access_token:'slack-access-token', team:{ id:'T1', name:'Workspace' } }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  const slackToken = await exchangeOAuthCode('slack', getOAuthClientConfig('slack', env), 'slack-code');
  assert.equal(slackToken.access_token, 'slack-access-token');
  assert.match(captured.options.headers.Authorization, /^Basic /);
  const slackForm = new URLSearchParams(captured.options.body);
  assert.equal(slackForm.get('client_secret'), null);
  assert.equal(slackForm.get('grant_type'), 'authorization_code');
} finally {
  globalThis.fetch = originalFetch;
}

const denied = await onRequest({ request:new Request('https://app.ovyx.example/api/settings/connection-oauth', { method:'PUT' }), env:{} });
assert.equal(denied.status, 405);
assert.equal(denied.headers.get('Allow'), 'GET, POST');
const invalidCallback = await onRequest({ request:new Request('https://app.ovyx.example/api/settings/connection-oauth?action=callback&state=invalid'), env:{} });
assert.equal(invalidCallback.status, 200);
assert.match(await invalidCallback.text(), /OVYX/);
const callbackMethod = await oauthCallbackRoute({ request:new Request('https://app.ovyx.example/api/settings/connection-oauth/callback', { method:'POST' }), env:{} });
assert.equal(callbackMethod.status, 405);
assert.equal(callbackMethod.headers.get('Allow'), 'GET');

console.log('Connection OAuth tests passed: provider registry, least-privilege service scopes, PKCE, server-side token exchange, identity verification and route method guards.');
