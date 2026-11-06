const SERVICES = Object.freeze({
  notion: { id:'notion', provider:'notion', name:'Notion', endpoint:'https://api.notion.com/v1', healthUrl:'https://api.notion.com/v1/users/me', scopes:[], version:'2022-06-28' },
  slack: { id:'slack', provider:'slack', name:'Slack', endpoint:'https://slack.com/api', healthUrl:'https://slack.com/api/auth.test', scopes:['chat:write','channels:read','users:read'] },
  discord: { id:'discord', provider:'discord', name:'Discord', endpoint:'https://discord.com/api/v10', healthUrl:'https://discord.com/api/v10/users/@me', scopes:['identify','guilds'] },
  googledrive: { id:'googledrive', provider:'google', name:'Google Drive', endpoint:'https://www.googleapis.com/drive/v3', healthUrl:'https://openidconnect.googleapis.com/v1/userinfo', scopes:['https://www.googleapis.com/auth/drive.file','openid','email','profile'] },
  googlesheets: { id:'googlesheets', provider:'google', name:'Google Sheets', endpoint:'https://sheets.googleapis.com/v4', healthUrl:'https://openidconnect.googleapis.com/v1/userinfo', scopes:['https://www.googleapis.com/auth/spreadsheets','openid','email','profile'] },
  googlecalendar: { id:'googlecalendar', provider:'google', name:'Google Calendar', endpoint:'https://www.googleapis.com/calendar/v3', healthUrl:'https://openidconnect.googleapis.com/v1/userinfo', scopes:['https://www.googleapis.com/auth/calendar.events','openid','email','profile'] }
});

const PROVIDERS = Object.freeze({
  notion: { prefix:'NOTION', authorize:'https://api.notion.com/v1/oauth/authorize', token:'https://api.notion.com/v1/oauth/token', tokenAuth:'basic', identity:'token-owner', refresh:false, pkce:false },
  slack: { prefix:'SLACK', authorize:'https://slack.com/oauth/v2/authorize', token:'https://slack.com/api/oauth.v2.access', tokenAuth:'body', identity:'token-team', refresh:true, pkce:false },
  discord: { prefix:'DISCORD', authorize:'https://discord.com/oauth2/authorize', token:'https://discord.com/api/oauth2/token', tokenAuth:'body', identity:'https://discord.com/api/v10/users/@me', refresh:true, pkce:true },
  google: { prefix:'GOOGLE', authorize:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', tokenAuth:'body', identity:'https://openidconnect.googleapis.com/v1/userinfo', refresh:true, pkce:true }
});

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

export function getOAuthService(serviceId) {
  return SERVICES[clean(serviceId, 40).toLowerCase()] || null;
}

export function getOAuthProvider(providerId) {
  return PROVIDERS[clean(providerId, 40).toLowerCase()] || null;
}

export function getOAuthClientConfig(providerId, env = {}) {
  const provider = getOAuthProvider(providerId);
  if (!provider) return { configured:false, missing:['provider'] };
  const prefix = 'OVYX_CONNECTION_OAUTH_' + provider.prefix;
  const clientId = clean(env[prefix + '_CLIENT_ID'], 500);
  const clientSecret = clean(env[prefix + '_CLIENT_SECRET'], 1000);
  const redirectUri = clean(env.OVYX_CONNECTION_OAUTH_REDIRECT_URI, 1000);
  const missing = [];
  if (!clientId) missing.push(prefix + '_CLIENT_ID');
  if (!clientSecret) missing.push(prefix + '_CLIENT_SECRET');
  if (!redirectUri) missing.push('OVYX_CONNECTION_OAUTH_REDIRECT_URI');
  if (redirectUri) {
    try {
      const parsed = new URL(redirectUri);
      if (parsed.protocol !== 'https:' || parsed.pathname !== '/api/settings/connection-oauth' || parsed.searchParams.get('action') !== 'callback') missing.push('OVYX_CONNECTION_OAUTH_REDIRECT_URI (must be the HTTPS callback URL ending in ?action=callback)');
    } catch { missing.push('OVYX_CONNECTION_OAUTH_REDIRECT_URI (invalid URL)'); }
  }
  return { configured:missing.length===0, missing, clientId, clientSecret, redirectUri, provider };
}

export function buildOAuthAuthorizationUrl(serviceId, config, state, codeChallenge = '') {
  const service = getOAuthService(serviceId);
  if (!service || !config?.configured) throw new Error('OAuth service is not configured.');
  const provider = config.provider;
  const url = new URL(provider.authorize);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  if (service.provider === 'notion') {
    url.searchParams.set('owner', 'user');
  } else if (service.provider === 'slack') {
    url.searchParams.set('scope', service.scopes.join(','));
  } else {
    url.searchParams.set('scope', service.scopes.join(' '));
  }
  if (provider.pkce && codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (service.provider === 'google') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  }
  if (service.provider === 'discord') url.searchParams.set('permissions', '0');
  return url.toString();
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, redirect:'manual', signal:controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') {
      throw Object.assign(new Error('OAuth provider request failed.'), { code:'OAUTH_PROVIDER_REQUEST_FAILED', status:502 });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeOAuthCode(serviceId, config, code, codeVerifier = '') {
  const service = getOAuthService(serviceId);
  if (!service || !config?.configured) throw new Error('OAuth service is not configured.');
  const provider = config.provider;
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('code', clean(code, 2048));
  body.set('redirect_uri', config.redirectUri);
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  const headers = { Accept:'application/json', 'Content-Type':'application/x-www-form-urlencoded' };
  if (provider.tokenAuth === 'basic') {
    headers.Authorization = 'Basic ' + btoa(config.clientId + ':' + config.clientSecret);
    body.delete('client_id');
    body.delete('client_secret');
  }
  const payload = await requestJson(provider.token, { method:'POST', headers, body:body.toString() });
  if (payload.error || payload.ok === false || !clean(payload.access_token, 8000)) {
    throw Object.assign(new Error('OAuth provider did not issue an access token.'), { code:'OAUTH_TOKEN_EXCHANGE_FAILED', status:502 });
  }
  return payload;
}

export async function identifyOAuthAccount(serviceId, tokenPayload) {
  const service = getOAuthService(serviceId);
  if (!service) throw new Error('OAuth service is not supported.');
  let identity = null;
  if (service.provider === 'notion') {
    const owner = tokenPayload.owner || {};
    const user = owner.user || {};
    identity = { id:clean(user.id || tokenPayload.workspace_id, 180), name:clean(user.name || tokenPayload.workspace_name || 'Notion workspace', 160), email:clean(user.person?.email, 240) };
  } else if (service.provider === 'slack') {
    const team = tokenPayload.team || {};
    const authed = tokenPayload.authed_user || {};
    identity = { id:clean(team.id || authed.id, 180), name:clean(team.name || 'Slack workspace', 160), email:'' };
  } else {
    const url = service.provider === 'google' ? PROVIDERS.google.identity : PROVIDERS.discord.identity;
    const response = await requestJson(url, { headers:{ Authorization:'Bearer ' + clean(tokenPayload.access_token, 8000), Accept:'application/json' } });
    identity = service.provider === 'google'
      ? { id:clean(response.sub, 180), name:clean(response.name || response.email || 'Google account', 160), email:clean(response.email, 240) }
      : { id:clean(response.id, 180), name:clean(response.global_name || response.username || 'Discord account', 160), email:'' };
  }
  if (!identity?.id) throw Object.assign(new Error('OAuth account identity could not be verified.'), { code:'OAUTH_IDENTITY_INVALID', status:502 });
  return identity;
}

export async function refreshOAuthCredential(providerId, config, refreshToken) {
  const provider = getOAuthProvider(providerId);
  if (!provider?.refresh || !config?.configured || !refreshToken) {
    throw Object.assign(new Error('This OAuth connection cannot refresh its token. Reconnect the service.'), { code:'OAUTH_RECONNECT_REQUIRED', status:409 });
  }
  const body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:clean(refreshToken, 8000), client_id:config.clientId, client_secret:config.clientSecret });
  const headers = { Accept:'application/json', 'Content-Type':'application/x-www-form-urlencoded' };
  const payload = await requestJson(provider.token, { method:'POST', headers, body:body.toString() });
  if (payload.error || payload.ok === false || !clean(payload.access_token, 8000)) {
    throw Object.assign(new Error('OAuth token refresh failed. Reconnect the service.'), { code:'OAUTH_REFRESH_FAILED', status:409 });
  }
  return payload;
}

export const OAUTH_SERVICE_IDS = Object.freeze(Object.keys(SERVICES));
export const OAUTH_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));
