(function () {
  'use strict';
  if (window.__OVYX_SIDEBAR_ACCOUNT_SYNC_V1__) return;
  window.__OVYX_SIDEBAR_ACCOUNT_SYNC_V1__ = true;

  const PROFILE_PREFIX = 'ovyx.profile.v2.user.';
  const $ = id => document.getElementById(id);
  let auth = null;
  let lastUid = null;

  function currentUser() {
    try { return window.firebase?.auth?.()?.currentUser || null; }
    catch (_) { return null; }
  }

  function savedProfile(user) {
    if (!user?.uid) return {};
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_PREFIX + user.uid) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function initials(value) {
    const words = String(value || 'OVYX').trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : String(words[0] || 'OV').slice(0, 2)).toUpperCase();
  }

  function tierLabel() {
    const tier = String(window.__OVYX_SERVER_ENTITLEMENTS?.planTier ||
      window.__OVYX_SERVER_ENTITLEMENTS?.plan || window.KernelState?.userTier || 'free').trim();
    return (tier || 'free').toUpperCase() + ' TIER';
  }

  function setText(id, value) {
    const node = $(id);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setAvatar(node, profile, user, name) {
    if (!node) return;
    const photo = String(profile.avatar || profile.photoURL || user?.photoURL || '').trim();
    if (photo) {
      if (node.dataset.ovyxAvatarUrl !== photo) {
        node.replaceChildren();
        const image = document.createElement('img');
        image.src = photo;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        node.appendChild(image);
        node.dataset.ovyxAvatarUrl = photo;
      }
    } else {
      node.dataset.ovyxAvatarUrl = '';
      const fallback = initials(name);
      if (node.children.length || node.textContent !== fallback) {
        node.replaceChildren(document.createTextNode(fallback));
      }
    }
  }

  function sync(user = currentUser()) {
    const uid = String(user?.uid || '');
    const profile = savedProfile(user);
    const email = String(user?.email || '').trim();
    const emailName = email.includes('@') ? email.slice(0, email.indexOf('@')) : '';
    const name = user
      ? String(profile.name || user.displayName || emailName || 'OVYX User').trim()
      : 'Sign in to your account';
    const tier = tierLabel();

    setText('sidebar-user-display-name', name);
    setText('sidebar-user-tier-badge', tier);
    const desktopAvatar = $('sidebar-avatar-initials');
    setAvatar(desktopAvatar, profile, user, name);

    setText('v52-account-name', name);
    setText('v52-account-email', email || (user ? 'Account email unavailable' : 'Not signed in'));
    setText('v52-account-tier', tier);
    const mobileAvatar = $('v52-account-avatar');
    setAvatar(mobileAvatar, profile, user, name);

    const desktopProfile = document.querySelector('.ovyx-sidebar-profile');
    if (desktopProfile) desktopProfile.setAttribute('aria-label', user ? 'Open account profile' : 'Sign in to your OVYX account');
    const mobileProfile = $('v52-profile-btn');
    if (mobileProfile) mobileProfile.textContent = user ? 'Profile' : 'Sign in';

    if (lastUid !== uid) {
      lastUid = uid;
      window.dispatchEvent(new CustomEvent('ovyx:sidebar-account-synced', { detail: { authenticated: Boolean(user), uid } }));
    }
  }

  function openSignIn() {
    if (window.OVYXAuthRoutes?.navigate) {
      window.OVYXAuthRoutes.navigate('login', false);
      return;
    }
    try { window.Router?.go?.('home'); } catch (_) {}
    window.OVYXMasterAuth?.openAuth?.();
  }

  document.addEventListener('click', event => {
    const trigger = event.target?.closest?.('.ovyx-sidebar-profile,#v52-profile-btn');
    if (!trigger || currentUser()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSignIn();
  }, true);

  function observeAccountSurfaces() {
    const mobile = $('ovyx-v52-mobile-account');
    if (mobile && !mobile.dataset.ovyxAccountSyncObserved) {
      mobile.dataset.ovyxAccountSyncObserved = '1';
      new MutationObserver(() => sync()).observe(mobile, { childList: true, subtree: true });
    }
    const desktopName = $('sidebar-user-display-name');
    if (desktopName && !desktopName.dataset.ovyxAccountSyncObserved) {
      desktopName.dataset.ovyxAccountSyncObserved = '1';
      new MutationObserver(() => {
        const user = currentUser();
        if (user) setText('v52-account-name', String(savedProfile(user).name || user.displayName || user.email?.split('@')[0] || 'OVYX User'));
      }).observe(desktopName, { childList: true, characterData: true, subtree: true });
    }
  }

  function installAuthListener() {
    try {
      auth = window.firebase?.auth?.();
      if (!auth || typeof auth.onAuthStateChanged !== 'function' || auth.__ovyxSidebarAccountSyncV1) return;
      auth.__ovyxSidebarAccountSyncV1 = true;
      auth.onAuthStateChanged(user => sync(user));
    } catch (error) {
      console.warn('[OVYX sidebar] account state could not be observed', error);
    }
  }

  function boot() {
    sync();
    installAuthListener();
    observeAccountSurfaces();
    window.addEventListener('firebase-auth-state-ready', () => sync(), { passive: true });
    window.addEventListener('ovyx:auth-ready', () => sync(), { passive: true });
    window.addEventListener('ovyx:view-changed', () => { sync(); observeAccountSurfaces(); }, { passive: true });
    window.addEventListener('ovyx:profile-updated', () => sync(), { passive: true });
    window.addEventListener('ovyx:workspace-changed', () => sync(), { passive: true });
    const bodyObserver = new MutationObserver(() => {
      observeAccountSurfaces();
      if (!auth) installAuthListener();
    });
    if (document.body) bodyObserver.observe(document.body, { childList: true, subtree: true });
    window.OVYXSidebarAccountSync = Object.freeze({ refresh: () => sync(), version: 1 });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();