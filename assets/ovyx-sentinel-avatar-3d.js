(() => {
  'use strict';
  if (window.__OVYX_SENTINEL_3D_GUARDIAN_V1__) return;
  window.__OVYX_SENTINEL_3D_GUARDIAN_V1__ = true;

  // Real, dressed humanoid model and matching rig animations.
  // The upstream model is MIT licensed; attribution and source are documented.
  const MODEL_URL = 'https://models.codelove.in/models/business-male-01.glb';
  const CLIPS = Object.freeze({
    idle: 'https://models.codelove.in/animations/m_idle_neutral_01.glb',
    talk: 'https://models.codelove.in/animations/m_gestic_talk_neutral_01.glb',
    wave: 'https://models.codelove.in/animations/m_wave_01.glb',
  });
  const THREE_URL = 'https://esm.sh/three@0.180.0';
  const LOADER_URL = 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
  const MESHOPT_URL = 'https://esm.sh/three@0.180.0/examples/jsm/libs/meshopt_decoder.module.js';
  let stage = null;
  let panel = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let mixer = null;
  let actions = {};
  let activeAction = null;
  let characterRoot = null;
  let rootBaseY = 0;
  let rootBaseRotation = 0;
  let speakingRequested = false;
  let frame = 0;
  let resizeObserver = null;
  let loading = null;
  let destroyed = false;
  let speechHookInstalled = false;
  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function addStyles() {
    if (document.getElementById('ovyx-sentinel-3d-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-sentinel-3d-styles';
    style.textContent = [
      '#ovyx-sentinel-avatar-stage{position:relative;flex:0 0 auto;height:224px;min-height:190px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.055);background:radial-gradient(ellipse at 50% 62%,rgba(71,155,184,.16),rgba(8,13,20,0) 68%);isolation:isolate}',
      '#ovyx-sentinel-avatar-stage canvas{display:block;width:100%;height:100%;outline:0}',
      '#ovyx-sentinel-avatar-stage .ovsx3-status{position:absolute;left:12px;bottom:9px;max-width:calc(100% - 24px);padding:4px 7px;border:1px solid rgba(151,222,239,.13);border-radius:7px;background:rgba(5,10,15,.65);color:#a8c5d0;font:700 8px/1.3 Inter,system-ui,sans-serif;pointer-events:none}',
      '#ovyx-sentinel-avatar-stage .ovsx3-credit{position:absolute;right:10px;bottom:9px;color:rgba(172,190,202,.62);font:500 7px/1.3 Inter,system-ui,sans-serif;text-align:right;pointer-events:none}',
      '#ovyx-sentinel-avatar-stage[data-state="error"] .ovsx3-status{color:#fda4af;border-color:rgba(251,113,133,.22)}',
      '@media(max-width:520px){#ovyx-sentinel-avatar-stage{height:206px;min-height:180px}}',
      '@media(prefers-reduced-motion:reduce){#ovyx-sentinel-avatar-stage canvas{animation:none!important}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function setStageStatus(message, state) {
    if (!stage) return;
    stage.dataset.state = state || 'ready';
    const label = stage.querySelector('.ovsx3-status');
    if (label) label.textContent = String(message || '').slice(0, 120);
  }

  function ensureStage() {
    panel = document.getElementById('ovyx-sentinel-panel');
    if (!panel) return null;
    stage = document.getElementById('ovyx-sentinel-avatar-stage');
    if (stage) return stage;
    stage = document.createElement('div');
    stage.id = 'ovyx-sentinel-avatar-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', 'OVYX Sentinel 3D human guardian avatar');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('tabindex', '-1');
    const status = document.createElement('div');
    status.className = 'ovsx3-status';
    status.textContent = 'Preparing your 3D Guardian…';
    const credit = document.createElement('div');
    credit.className = 'ovsx3-credit';
    credit.textContent = '3D model: Businessman 01 · MIT';
    stage.append(canvas, status, credit);
    const actionsBar = panel.querySelector('.actions');
    panel.insertBefore(stage, actionsBar || panel.querySelector('.status') || null);
    addStyles();
    return stage;
  }

  function crossFade(name, seconds = 0.28) {
    const next = actions[name];
    if (!next || next === activeAction) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.play();
    if (activeAction) activeAction.crossFadeTo(next, reducedMotion() ? 0 : seconds, false);
    activeAction = next;
  }

  function playWave() {
    const wave = actions.wave;
    if (!wave) { crossFade('idle'); return; }
    wave.reset();
    wave.setLoop(window.__OVYX_THREE__?.LoopOnce || 2200, 1);
    wave.clampWhenFinished = true;
    wave.play();
    if (activeAction && activeAction !== wave) activeAction.crossFadeTo(wave, reducedMotion() ? 0 : 0.2, false);
    activeAction = wave;
    const duration = Math.max(900, Number(wave.getClip()?.duration || 3) * 1000);
    window.setTimeout(() => { if (activeAction === wave) crossFade('idle', 0.25); }, Math.min(duration, 9000));
  }

  async function loadModel() {
    if (loading) return loading;
    const target = ensureStage();
    if (!target) return;
    const canvas = target.querySelector('canvas');
    setStageStatus('Loading the 3D character and motion…', 'loading');
    loading = (async () => {
      try {
        const [THREE, loaderModule, meshoptModule] = await Promise.all([
          import(THREE_URL),
          import(LOADER_URL),
          import(MESHOPT_URL),
        ]);
        window.__OVYX_THREE__ = THREE;
        if (destroyed || !canvas.isConnected) return;
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
        camera.position.set(0, 1.02, 4.9);
        camera.lookAt(0, 0.91, 0);
        scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x23313d, 2.0));
        const key = new THREE.DirectionalLight(0xffedda, 2.0);
        key.position.set(2.5, 4.5, 3.2);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x7edcf0, 0.9);
        fill.position.set(-3, 2, -2);
        scene.add(fill);

        const loader = new loaderModule.GLTFLoader().setMeshoptDecoder(meshoptModule.MeshoptDecoder);
        const [model, idle, talk, wave] = await Promise.all([
          loader.loadAsync(MODEL_URL),
          loader.loadAsync(CLIPS.idle),
          loader.loadAsync(CLIPS.talk),
          loader.loadAsync(CLIPS.wave),
        ]);
        if (destroyed || !canvas.isConnected) { renderer.dispose(); return; }
        const character = model.scene;
        const box = new THREE.Box3().setFromObject(character);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        character.position.x -= center.x;
        character.position.z -= center.z;
        character.position.y -= box.min.y;
        characterRoot = character;
        rootBaseY = character.position.y;
        rootBaseRotation = character.rotation.y;
        scene.add(character);
        camera.position.set(0, Math.max(0.9, size.y * 0.58), Math.max(3.5, size.y * 2.65));
        camera.lookAt(0, size.y * 0.48, 0);
        mixer = new THREE.AnimationMixer(character);
        const idleClip = idle.animations?.[0];
        const talkClip = talk.animations?.[0];
        const waveClip = wave.animations?.[0];
        if (idleClip) actions.idle = mixer.clipAction(idleClip);
        if (talkClip) actions.talk = mixer.clipAction(talkClip);
        if (waveClip) actions.wave = mixer.clipAction(waveClip);
        if (actions.idle) { actions.idle.play(); activeAction = actions.idle; }
        mixer.addEventListener('finished', event => {
          if (event.action === actions.wave) crossFade('idle', 0.25);
        });
        resize();
        setStageStatus('Your 3D Guardian is ready.', 'ready');
        if (speakingRequested || window.speechSynthesis?.speaking) crossFade('talk', 0.12);
        else crossFade('idle', 0.12);
        if (!document.getElementById('ovyx-sentinel-panel')?.hidden) playWave();
        animate();
        installSpeechHook();
      } catch (error) {
        console.warn('[OVYX Sentinel 3D] Avatar unavailable:', String(error?.message || 'model load failed').slice(0, 140));
        setStageStatus('3D character is offline. The voice companion is still available.', 'error');
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function resize() {
    if (!renderer || !camera || !stage) return;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    if (frame) window.cancelAnimationFrame(frame);
    const THREE = window.__OVYX_THREE__;
    let last = performance.now();
    const tick = now => {
      frame = 0;
      if (destroyed) return;
      const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!document.hidden && renderer && scene && camera) {
        if (mixer) mixer.update(delta);
        if (characterRoot && stage && stage.dataset.state === 'ready' && reducedMotion() === false) {
          // Small non-periodic-looking body sway keeps the character present
          // without overriding the rig's idle/talk/wave animation clips.
          characterRoot.rotation.y = rootBaseRotation + Math.sin(now * 0.00027) * 0.018;
          characterRoot.position.y = rootBaseY + Math.sin(now * 0.0011) * 0.004;
        }
        renderer.render(scene, camera);
      }
      frame = window.requestAnimationFrame(tick);
    };
    if (THREE && renderer) frame = window.requestAnimationFrame(tick);
  }

  function installSpeechHook() {
    if (speechHookInstalled || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak?.bind(synth);
    const originalCancel = synth.cancel?.bind(synth);
    if (typeof originalSpeak !== 'function') return;
    try {
      synth.speak = function (utterance) {
        if (panel && !panel.hidden) {
          crossFade('talk', 0.18);
          if (utterance && typeof utterance.addEventListener === 'function') {
            const settle = () => { if (activeAction === actions.talk) crossFade('idle', 0.3); };
            utterance.addEventListener('end', settle, { once: true });
            utterance.addEventListener('error', settle, { once: true });
          } else if (utterance) {
            const oldEnd = utterance.onend;
            const oldError = utterance.onerror;
            utterance.onend = event => { try { oldEnd?.call(utterance, event); } finally { if (activeAction === actions.talk) crossFade('idle', 0.3); } };
            utterance.onerror = event => { try { oldError?.call(utterance, event); } finally { if (activeAction === actions.talk) crossFade('idle', 0.3); } };
          }
        }
        return originalSpeak(utterance);
      };
      if (typeof originalCancel === 'function') {
        synth.cancel = function () {
          const result = originalCancel();
          if (activeAction === actions.talk) crossFade('idle', 0.2);
          return result;
        };
      }
      speechHookInstalled = true;
    } catch (_) { /* The browser may expose speech methods as non-writable. */ }
  }

  function observePanel() {
    const existing = document.getElementById('ovyx-sentinel-panel');
    if (existing) {
      panel = existing;
      if (!stage) ensureStage();
      if (typeof ResizeObserver === 'function' && stage && !resizeObserver) {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
      }
      if (panel.hidden) {
        const observer = new MutationObserver(() => {
          if (!panel || panel.hidden) return;
          void loadModel().then(() => { if (actions.wave) playWave(); });
        });
        observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
        panel.__ovyxSentinel3dObserver = observer;
      } else {
        void loadModel();
      }
      return true;
    }
    return false;
  }

  function boot() {
    if (observePanel()) return;
    const observer = new MutationObserver(() => {
      if (observePanel()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) { window.cancelAnimationFrame(frame); frame = 0; }
    else if (!document.hidden && renderer && !frame) animate();
  });
  window.addEventListener('resize', resize, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXSentinel3D = Object.freeze({
    load: loadModel,
    setSpeaking: value => {
      speakingRequested = value === true;
      crossFade(speakingRequested ? 'talk' : 'idle', 0.25);
    },
    getState: () => ({ loaded: !!renderer, state: stage?.dataset?.state || 'waiting' }),
  });
})();