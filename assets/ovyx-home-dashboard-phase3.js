/* OVYX Home Dashboard — plain-language UX copy.
   Changes only visible Home copy; action handlers and data flow remain owned by the app. */
(() => {
  'use strict';
  if (window.__OVYX_HOME_UX_WRITING_V1__) return;
  window.__OVYX_HOME_UX_WRITING_V1__ = true;

  const byId = id => document.getElementById(id);
  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  const applyCopy = () => {
    const home = byId('view-home');
    if (!home) return;
    const heading = home.querySelector('.v59-hero-copy h1');
    if (heading && heading.dataset.ovyxCopyV1 !== '1') {
      heading.innerHTML = 'What would you like<br/><em>to create?</em>';
      heading.dataset.ovyxCopyV1 = '1';
    }
    const intro = home.querySelector('.v59-hero-copy p');
    setText(intro, 'Describe something new, tell OVYX what to improve, or add files and photos to guide your work.');
    const prompt = byId('prompt-home-input');
    if (prompt) {
      prompt.placeholder = 'Describe what you want to create or change…';
      prompt.setAttribute('aria-label', 'Describe what you want OVYX to create or change');
    }
    const modeLabel = home.querySelector('.v59-model-label');
    setText(modeLabel, 'RESPONSE STYLE');
    const mode = byId('v59-ai-mode-select');
    if (mode) {
      mode.setAttribute('aria-label', 'Choose how detailed OVYX responses should be');
      const labels = { balanced: 'Everyday · balanced', fast: 'Quick · concise', quality: 'Deep · detailed' };
      Array.from(mode.options || []).forEach(option => {
        if (labels[option.value]) option.textContent = labels[option.value];
      });
    }
    const build = byId('v59-build');
    const buildLabel = build?.querySelector('span');
    setText(buildLabel, 'Start building');
    if (build) build.setAttribute('aria-label', 'Start building with OVYX');
    const toolsHeading = home.querySelector('.v59-workspace-section .v59-section-head h2');
    setText(toolsHeading, 'Choose where to work.');
    const recentHeading = home.querySelector('.v59-recent-section .v59-section-head h2');
    setText(recentHeading, 'Pick up where you left off.');
    const toolCards = home.querySelectorAll('.v59-tool-card');
    const descriptions = [
      'Create and refine responsive websites.',
      'Plan app screens, layouts and user flows.',
      'Update website content, media and publishing.',
      'Open saved work, pages and revisions.'
    ];
    toolCards.forEach((card, index) => {
      const small = card.querySelector('small');
      if (descriptions[index]) setText(small, descriptions[index]);
    });
    const plusNote = byId('v59-plus-note');
    if (plusNote) {
      const icon = plusNote.querySelector('i');
      plusNote.textContent = 'Add files or photos to give OVYX more context. You can remove attachments before you start.';
      if (icon) { plusNote.prepend(icon); icon.setAttribute('aria-hidden', 'true'); }
    }
    const addMenu = byId('v59-add-menu');
    const scanDescription = addMenu?.querySelector('[data-v59-add="scan"] small');
    setText(scanDescription, 'Capture a document with your camera.');
    const photoDescription = addMenu?.querySelector('[data-v59-add="photo"] small');
    setText(photoDescription, 'Take a photo to use as a reference.');
    const fileDescription = addMenu?.querySelector('[data-v59-add="files"] small');
    setText(fileDescription, 'Add documents, images or project files.');
    const commands = home.querySelector('.v59-workspace-section .v59-command-link');
    if (commands) commands.setAttribute('aria-label', 'Open commands. Keyboard shortcut: Control or Command plus K.');
    const recentLink = home.querySelector('.v59-recent-section .v59-command-link');
    if (recentLink) recentLink.setAttribute('aria-label', 'View all projects');
  };

  const boot = () => {
    applyCopy();
    const home = byId('view-home');
    if (home && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => applyCopy());
      observer.observe(home, { childList: true, subtree: true });
      window.__OVYX_HOME_UX_WRITING_OBSERVER__ = observer;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
