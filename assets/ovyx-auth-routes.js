(function () {
  'use strict';
  if (window.__OVYX_AUTH_ROUTES_V1__) return;
  window.__OVYX_AUTH_ROUTES_V1__ = true;

  const ROUTES = {
    '/login': 'login',
    '/signup': 'signup',
    '/forgot-password': 'forgot',
    '/verify-email': 'verify',
    '/auth/callback': 'callback'
  };
  const PATHS = { login: '/login', signup: '/signup', forgot: '/forgot-password', verify: '/verify-email', callback: '/auth/callback' };
  const $ = id => document.getElementById(id);
  let activeMode = '';

  function modeFromPath() {
    return ROUTES[(location.pathname || '/').replace(/\/+$/, '') || '/'] || '';
  }
  function setPath(mode, replace) {
    const path = PATHS[mode] || '/';
    if (location.pathname !== path) {
      try { history[replace ? 'replaceState' : 'pushState']({ ...(history.state || {}), ovyxAuthRoute: mode }, '', path + location.search + location.hash); } catch (_) {}
    }
  }
  function showAuthSurface() {
    // Keep the application route on Home: the existing guest-session observer
    // intentionally redirects away from the internal master-auth route.
    // The auth surface is an overlay and must not mutate the workspace route.
    try { window.OVYXMasterAuth?.openAuth?.(); } catch (_) {}
  }
  function setLoginMode(signup) {
    if (!!window.isSignUpMode !== !!signup) {
      try { window.OVYXAuthMode?.toggle?.(); } catch (_) { window.isSignUpMode = !!signup; }
    }
    try { window.OVYXAuthMode?.render?.(); } catch (_) {}
  }
  function setStatus(message, kind) {
    const node = $('ovyx-master-auth-status');
    if (node) { node.textContent = message; node.className = 'ovyx-master-auth-status ' + (kind || ''); }
    const verifyStatus = $('ovyx-auth-verify-status');
    if (verifyStatus) verifyStatus.textContent = message;
  }
  function hide(node, hidden) {
    if (!node) return;
    node.hidden = !!hidden;
    node.setAttribute('aria-hidden', String(!!hidden));
  }
  function restoreForm() {
    const form = $('ovyx-master-auth-form');
    if (!form) return;
    form.dataset.authPage = 'login';
    hide($('ovyx-auth-google-btn'), false);
    hide($('ovyx-auth-github-btn'), false);
    hide(form.querySelector('.ovyx-auth-divider'), false);
    hide($('ovyx-auth-create'), false);
    hide($('ovyx-auth-forgot'), false);
    hide($('ovyx-master-auth-password')?.closest('label'), false);
    hide($('ovyx-master-auth-confirm-wrap'), !window.isSignUpMode);
    const submit = $('ovyx-master-auth-submit');
    if (submit) submit.textContent = window.isSignUpMode ? 'Create Account & Activate Workspace' : 'Log In';
  }
  function renderForgot() {
    setLoginMode(false);
    restoreForm();
    const form = $('ovyx-master-auth-form');
    if (form) form.dataset.authPage = 'forgot';
    hide($('ovyx-master-auth-password')?.closest('label'), true);
    hide($('ovyx-auth-google-btn'), true);
    hide($('ovyx-auth-github-btn'), true);
    hide(form?.querySelector('.ovyx-auth-divider'), true);
    hide($('ovyx-auth-create'), true);
    hide($('ovyx-auth-forgot'), true);
    hide($('ovyx-master-auth-confirm-wrap'), true);
    const title = $('ovyx-master-auth-title'), subtitle = $('ovyx-master-auth-subtitle');
    const cardTitle = $('ovyx-master-auth-card-title'), submit = $('ovyx-master-auth-submit');
    if (title) title.textContent = 'Reset your password';
    if (subtitle) subtitle.textContent = 'We’ll send a secure reset link if an OVYX account matches your email.';
    if (cardTitle) cardTitle.textContent = 'Password recovery';
    if (submit) submit.textContent = 'Send reset link';
    const email = $('ovyx-master-auth-email');
    if (email) { email.setAttribute('autocomplete', 'email'); email.focus?.(); }
    setStatus('Enter the email address associated with your OVYX account.', 'info');
  }
  async function submitForgot(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const email = String($('ovyx-master-auth-email')?.value || '').trim();
    if (!email) { setStatus('Enter your account email first.', 'error'); $('ovyx-master-auth-email')?.focus(); return; }
    const auth = window.firebase?.auth?.();
    if (!auth?.sendPasswordResetEmail) { setStatus('Password recovery is temporarily unavailable. Please try again.', 'error'); return; }
    const button = $('ovyx-master-auth-submit');
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }
    try {
      await auth.sendPasswordResetEmail(email);
      setStatus('If an OVYX account matches that email, password reset instructions will be sent.', 'ok');
    } catch (error) {
      const code = String(error?.code || '');
      setStatus(code === 'auth/invalid-email' ? 'Enter a valid email address and try again.' : 'If an OVYX account matches that email, password reset instructions will be sent.', code === 'auth/invalid-email' ? 'error' : 'ok');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Send reset link'; }
    }
  }
  function renderVerify() {
    const user = window.firebase?.auth?.()?.currentUser;
    try { window.Router?.go?.('home', { force: true }); } catch (_) {}
    try { window.OVYXMasterAuth?.openAuth?.(); } catch (_) {}
    restoreForm();
    const form = $('ovyx-master-auth-form');
    if (form) form.dataset.authPage = 'verify';
    const title = $('ovyx-master-auth-title'), subtitle = $('ovyx-master-auth-subtitle');
    const cardTitle = $('ovyx-master-auth-card-title');
    if (title) title.textContent = 'Verify your email';
    if (subtitle) subtitle.textContent = 'One quick step helps keep your OVYX account secure.';
    if (cardTitle) cardTitle.textContent = 'Email verification';
    hide(form, true);
    let panel = $('ovyx-auth-verify-panel');
    if (!panel && form?.parentElement) {
      panel = document.createElement('div');
      panel.id = 'ovyx-auth-verify-panel';
      panel.className = 'ovyx-auth-verify-panel';
      panel.innerHTML = '<p class="ovyx-auth-verify-copy"></p><div id="ovyx-auth-verify-status" class="ovyx-auth-verify-status" role="status" aria-live="polite"></div><button type="button" class="ovyx-auth-primary" id="ovyx-auth-resend-verification">Resend verification email</button><button type="button" class="ovyx-auth-verify-secondary" id="ovyx-auth-check-verification">I’ve verified my email</button><button type="button" class="ovyx-auth-verify-secondary" id="ovyx-auth-back-to-login">Back to login</button>';
      form.parentElement.insertBefore(panel, form);
      $('ovyx-auth-resend-verification')?.addEventListener('click', async () => {
        const current = window.firebase?.auth?.()?.currentUser;
        if (!current) { setStatus('Sign in first to request a verification email.', 'error'); return; }
        try { await current.sendEmailVerification(); setStatus('A new verification email has been sent.', 'ok'); }
        catch (_) { setStatus('We could not send the verification email. Check your connection and try again.', 'error'); }
      });
      $('ovyx-auth-back-to-login')?.addEventListener('click', () => navigate('login', false));
      $('ovyx-auth-check-verification')?.addEventListener('click', async () => {
        const current = window.firebase?.auth?.()?.currentUser;
        if (!current) { setPath('login', true); renderRoute('login'); return; }
        try { await current.reload(); } catch (_) {}
        if (current.emailVerified) { setStatus('Your email is verified. You can continue to OVYX.', 'ok'); setTimeout(() => { setPath('login', true); window.Router?.go?.('home', { force: true }); }, 500); }
        else setStatus('Your email is not verified yet. Open the link in your inbox, then try again.', 'error');
      });
    }
    const copy = panel?.querySelector('.ovyx-auth-verify-copy');
    if (copy) copy.textContent = user?.email ? 'We sent a verification link to ' + user.email + '. Check your inbox and spam folder.' : 'Sign in to the account you want to verify, then request a verification email.';
    hide(panel, false);
    setStatus(user ? 'Check your inbox to finish setting up your account.' : 'Your account session is needed to send a verification email.', 'info');
  }
  function renderRoute(mode) {
    if (!mode) return;
    activeMode = mode;
    document.documentElement.dataset.ovyxAuthPage = mode;
    if (mode === 'callback') {
      const user = window.firebase?.auth?.()?.currentUser;
      if (user) { setPath('login', true); window.Router?.go?.('home', { force: true }); return; }
      mode = 'login';
      setPath('login', true);
    }
    if (mode === 'verify') { renderVerify(); return; }
    showAuthSurface();
    hide($('ovyx-auth-verify-panel'), true);
    hide($('ovyx-master-auth-form'), false);
    if (mode === 'forgot') { renderForgot(); return; }
    restoreForm();
    setLoginMode(mode === 'signup');
    const title = $('ovyx-master-auth-title'), subtitle = $('ovyx-master-auth-subtitle');
    if (title) title.textContent = mode === 'signup' ? 'Create your OVYX workspace' : 'Welcome back to OVYX';
    if (subtitle) subtitle.textContent = mode === 'signup' ? 'Create your account and bring your next idea to life.' : 'Sign in to continue to your workspace.';
    if (mode === 'signup') {
      hide($('ovyx-auth-google-btn'), true);
      hide($('ovyx-auth-github-btn'), true);
      hide($('ovyx-auth-google-btn')?.parentElement, true);
      hide($('ovyx-auth-create'), false);
    }
    if (mode === 'login') hide($('ovyx-auth-google-btn')?.parentElement, false);
    setStatus(mode === 'signup' ? 'Use an email and password to create your OVYX account.' : 'Your projects and workspace are ready when you are.', 'info');
  }
  function navigate(mode, replace) {
    setPath(mode, !!replace);
    renderRoute(mode);
  }
  function bind() {
    const form = $('ovyx-master-auth-form');
    if (form && !form.dataset.ovyxRoutesBound) {
      form.dataset.ovyxRoutesBound = '1';
      form.addEventListener('submit', event => { if (activeMode === 'forgot') submitForgot(event); }, true);
    }
    window.addEventListener('click', event => {
      const target = event.target?.closest?.('#ovyx-auth-create,#ovyx-auth-forgot,#ovyx-auth-back');
      if (!target) return;
      if (target.id === 'ovyx-auth-create') {
        const next = window.isSignUpMode ? 'login' : 'signup';
        setPath(next, false);
        activeMode = next;
      } else if (target.id === 'ovyx-auth-forgot') {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate('forgot', false);
      } else if (target.id === 'ovyx-auth-back') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPath('', true);
        document.documentElement.removeAttribute('data-ovyx-auth-page');
        document.body.classList.remove('ovyx-auth-open');
        document.documentElement.classList.remove('ovyx-auth-open');
        window.Router?.go?.('home', { force: true });
      }
    }, true);
    window.addEventListener('popstate', () => {
      const mode = modeFromPath();
      if (mode) renderRoute(mode);
      else { document.documentElement.removeAttribute('data-ovyx-auth-page'); document.body.classList.remove('ovyx-auth-open'); document.documentElement.classList.remove('ovyx-auth-open'); window.Router?.go?.('home', { force: true }); }
    });
    window.addEventListener('ovyx:view-changed', event => {
      const route = String(event.detail?.view || '').replace(/^view-/, '');
      if (route === 'home' && modeFromPath() && modeFromPath() !== 'verify') { setPath('', true); document.documentElement.removeAttribute('data-ovyx-auth-page'); document.body.classList.remove('ovyx-auth-open'); document.documentElement.classList.remove('ovyx-auth-open'); }
    });
  }
  function start() {
    bind();
    const authApi = window.OVYXMasterAuth;
    if (authApi && typeof authApi.createAccount === 'function' && !authApi.createAccount.__OVYX_VERIFY_AFTER_CREATE__) {
      const originalCreate = authApi.createAccount;
      const wrappedCreate = async function () {
        const beforeUid = window.firebase?.auth?.()?.currentUser?.uid || '';
        const result = await originalCreate.apply(this, arguments);
        const current = window.firebase?.auth?.()?.currentUser;
        if (activeMode === 'signup' && current && current.uid !== beforeUid) {
          try { await current.sendEmailVerification(); } catch (_) {}
          navigate('verify', false);
        }
        return result;
      };
      wrappedCreate.__OVYX_VERIFY_AFTER_CREATE__ = true;
      authApi.createAccount = wrappedCreate;
    }
    const mode = modeFromPath();
    if (mode) renderRoute(mode);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.OVYXAuthRoutes = { navigate, current: () => activeMode, render: renderRoute };
})();