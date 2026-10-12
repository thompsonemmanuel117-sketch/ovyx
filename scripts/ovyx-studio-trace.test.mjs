import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.className = '';
    this.textContent = '';
    this.parentNode = null;
    this.listeners = {};
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) {
    (this.listeners[name] ||= []).push(callback);
  }
  contains(target) {
    return target === this || this.children.some(child => child.contains(target));
  }
}
const head = new Element('head');
const body = new Element('body');
const document = {
  head,
  body,
  documentElement: new Element('html'),
  createElement(tag) { return new Element(tag); },
  getElementById(id) {
    const visit = node => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(head) || visit(body);
  },
  contains(target) { return head.contains(target) || body.contains(target); },
};
const appResponse = payload => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
let calls = 0;
let nextResponse = { ok: true, text: 'AI responded' };
let throwNetwork = false;
async function nativeFetch() {
  calls += 1;
  if (throwNetwork) throw new Error('network disconnected');
  return appResponse(nextResponse);
}
const window = {
  location: { href: 'https://app.ovyx/' },
  fetch: nativeFetch,
};
const source = fs.readFileSync(new URL('../assets/ovyx-studio-trace.js', import.meta.url), 'utf8');
vm.runInNewContext(source, { window, document, URL, Date, JSON, String, Number, Math, Promise });

assert.equal(typeof window.__OVYX_STUDIO_TRACE__.getState, 'function');
await window.fetch('/api/ai/gateway', {
  method: 'POST',
  body: JSON.stringify({ mode: 'assistant', prompt: 'Hello' }),
});
assert.equal(window.__OVYX_STUDIO_TRACE__.getState().events.length, 0,
  'Normal assistant chat should not open a Web Studio trace.');

nextResponse = {
  ok: true,
  needsUserInput: true,
  text: 'Share your public business email, or choose UI-only.',
  message: 'Share your public business email, or choose UI-only.',
};
const originalBody = JSON.stringify({ mode: 'build', prompt: 'Build a restaurant website' });
const readinessResponse = await window.fetch('/api/ai/gateway', { method: 'POST', body: originalBody });
assert.equal(readinessResponse.status, 200);
let trace = window.__OVYX_STUDIO_TRACE__.getState();
assert.equal(trace.status, 'Needs your input');
assert(trace.events.some(event => /Waiting for your details/.test(event.title)));
assert(!trace.events.some(event => /Build a restaurant website/.test(event.description)),
  'Trace should not expose the full user prompt.');

nextResponse = {
  ok: true,
  requirementVerification: { ok: true, checkedFiles: 4, checkedHtmlFiles: 2, issues: [] },
};
await window.fetch('/api/ai/gateway', {
  method: 'POST',
  body: JSON.stringify({ mode: 'build', prompt: 'Create a small site with Home and About pages.' }),
});
trace = window.__OVYX_STUDIO_TRACE__.getState();
assert.equal(trace.status, 'Output checks passed');
assert(trace.events.some(event => /Checked 4 files/.test(event.description)));

throwNetwork = true;
await assert.rejects(
  window.fetch('/api/ai/gateway', { method: 'POST', body: JSON.stringify({ mode: 'fix', prompt: 'Fix this website' }) }),
  /network disconnected/,
);
trace = window.__OVYX_STUDIO_TRACE__.getState();
assert.equal(trace.status, 'Request failed');
assert(trace.events.some(event => /network disconnected/.test(event.description)));
assert.equal(calls, 4, 'Fetch wrapper must make exactly one backend call per request.');

console.log('Web Studio trace runtime tests passed.');
