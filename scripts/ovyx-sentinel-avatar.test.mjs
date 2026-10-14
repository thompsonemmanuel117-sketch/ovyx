import assert from 'node:assert/strict';
import fs from 'node:fs';

const avatar = fs.readFileSync('assets/ovyx-sentinel-avatar-3d.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const docs = fs.readFileSync('docs/OVYX-SENTINEL-AVATAR.md', 'utf8');

for (const token of [
  'https://models.codelove.in/models/business-male-01.glb',
  'https://models.codelove.in/animations/m_idle_neutral_01.glb',
  'https://models.codelove.in/animations/m_gestic_talk_neutral_01.glb',
  'https://models.codelove.in/animations/m_wave_01.glb',
  'new THREE.WebGLRenderer',
  'new THREE.AnimationMixer',
  "crossFade('talk'",
  'speechSynthesis',
  'prefers-reduced-motion',
  '3D character is offline. The voice companion is still available.',
]) assert.ok(avatar.includes(token), '3D Guardian runtime is missing: ' + token);
assert.ok(middleware.includes('/assets/ovyx-sentinel-avatar-3d.js?v=20261014-1'), '3D Guardian runtime must be injected after Sentinel.');
assert.ok(headers.includes('/assets/ovyx-sentinel-avatar-3d.js'), '3D Guardian runtime must use explicit cache controls.');
assert.ok(docs.includes('MIT License') && docs.includes('Businessman 01'), 'The selected model and licence must be documented.');
assert.doesNotMatch(avatar, /getUserMedia|navigator\.mediaDevices|camera\.get/i, 'The 3D avatar must not enable camera access.');
assert.doesNotMatch(avatar, /recognition\.start\(|SpeechRecognition\s*=/, 'The 3D avatar must not start or replace the existing opt-in wake-word listener.');
console.log('OVYX Sentinel 3D avatar contract tests passed: dressed rigged model, idle/talk/wave animation, voice synchronization, accessible fallback, licence and privacy boundaries.');
