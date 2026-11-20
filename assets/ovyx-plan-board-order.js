(function () {
  'use strict';
  if (window.__OVYX_PLAN_BOARD_ORDER_V1__) return;
  window.__OVYX_PLAN_BOARD_ORDER_V1__ = true;

  const ORDER = ['free', 'pro', 'max'];
  let root = null;
  let observer = null;
  let frame = 0;

  function pricingRoot() {
    return document.getElementById('view-pricing') ||
      document.querySelector('[data-view="pricing"], [data-route="pricing"]');
  }

  function tierFromHeading(node) {
    const declared = String(node.getAttribute('data-plan-tier') ||
      node.getAttribute('data-tier') || '').trim().toLowerCase();
    if (ORDER.includes(declared)) return declared;
    const value = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const match = value.match(/^(?:ovyx\s+)?(free|pro|max)(?:\s+plan)?(?:\s*[-–—:].*)?$/i);
    return match ? match[1].toLowerCase() : '';
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let candidate = nodes[0];
    while (candidate) {
      if (nodes.every(node => candidate === node || candidate.contains(node))) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function directBranch(ancestor, node) {
    let current = node;
    while (current && current.parentElement !== ancestor) current = current.parentElement;
    return current && current.parentElement === ancestor ? current : null;
  }

  function reorder() {
    frame = 0;
    const nextRoot = pricingRoot();
    if (!nextRoot) return;
    if (root !== nextRoot) {
      observer?.disconnect();
      root = nextRoot;
      observer = new MutationObserver(schedule);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }

    const headings = Array.from(root.querySelectorAll(
      'h1,h2,h3,h4,h5,[data-plan-tier],[data-tier],[class*="plan-name" i]'
    ));
    const selected = {};
    for (const heading of headings) {
      const tier = tierFromHeading(heading);
      if (tier && !selected[tier]) selected[tier] = heading;
    }
    if (!ORDER.every(tier => selected[tier])) return;

    const ancestor = commonAncestor(ORDER.map(tier => selected[tier]));
    if (!ancestor || ancestor === root) return;
    const branches = Object.fromEntries(ORDER.map(tier =>
      [tier, directBranch(ancestor, selected[tier])]
    ));
    if (!ORDER.every(tier => branches[tier]) ||
        new Set(ORDER.map(tier => branches[tier])).size !== ORDER.length) return;

    // Move only the three existing plan-card branches. No plan content,
    // price, checkout action, or entitlement data is recreated or rewritten.
    const current = ORDER.map(tier => branches[tier]);
    const desired = ORDER.map(tier => branches[tier]);
    if (current.every((node, index) => node === desired[index])) return;
    for (const tier of ORDER) ancestor.appendChild(branches[tier]);
  }

  function schedule() {
    if (frame) return;
    frame = window.requestAnimationFrame(reorder);
  }

  function boot() {
    schedule();
    window.addEventListener('ovyx:view-changed', schedule, { passive: true });
    window.addEventListener('pageshow', schedule, { passive: true });
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      schedule();
      if (root || attempts >= 80) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
