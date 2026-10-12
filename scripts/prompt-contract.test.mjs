import assert from 'node:assert/strict';
import {
  buildPromptContract,
  getWebStudioBuildClarification,
  verifyPromptContractOutput,
} from '../functions/_lib/prompt-contract.js';

const brief = 'Build a five-page restaurant website with Home, Menu, About, Reservations, and Contact pages. Add a contact form and do not invent the address.';
const contract = buildPromptContract(brief);

assert.deepEqual(contract.explicitPages, ['Home', 'Menu', 'About', 'Reservations', 'Contact']);
assert(contract.explicitConstraints.some(item => /do not invent the address/i.test(item)));
assert(contract.contactSignals.contactForm);

const readiness = getWebStudioBuildClarification(
  'Build a restaurant website with a contact form that emails enquiries.',
  {},
);
assert(readiness, 'A new contact-form build should ask for the real receiving email.');
assert(readiness.questions.some(question => /public email address/i.test(question)));

const answeredReadiness = getWebStudioBuildClarification(
  'Build a restaurant website with a contact form that emails enquiries.',
  { conversationText: 'The public email is bookings@harbourhouse.ng' },
);
assert.equal(answeredReadiness, null, 'Do not ask again when the conversation already includes a real public email.');

const placeholderChoice = getWebStudioBuildClarification(
  'Build a restaurant website with a contact form that emails enquiries.',
  { conversationText: 'Use editable placeholders and build the UI only.' },
);
assert.equal(placeholderChoice, null, 'An explicit placeholder/UI-only choice should unblock the build.');

const completeFiles = {
  'src/pages/Home.html': '<!doctype html><html><head><title>Home</title></head><body><h1>Home</h1><form><label>Email<input type="email" name="email"></label><button>Send</button></form></body></html>',
  'src/pages/Menu.html': '<!doctype html><html><head><title>Menu</title></head><body><h1>Menu</h1></body></html>',
  'src/pages/About.html': '<!doctype html><html><head><title>About</title></head><body><h1>About</h1></body></html>',
  'src/pages/Reservations.html': '<!doctype html><html><head><title>Reservations</title></head><body><h1>Reservations</h1></body></html>',
  'src/pages/Contact.html': '<!doctype html><html><head><title>Contact</title></head><body><h1>Contact</h1></body></html>',
  'src/styles.css': 'body{margin:0}',
  'src/main.js': 'document.documentElement.dataset.ready="true";',
};
const siteMap = {
  pages: ['Home', 'Menu', 'About', 'Reservations', 'Contact'].map(title => ({ title })),
};
const verification = verifyPromptContractOutput(brief, completeFiles, siteMap);
assert.equal(verification.ok, true, JSON.stringify(verification));
assert.equal(verification.checkedHtmlFiles, 5);

const missingPage = verifyPromptContractOutput(
  brief,
  { ...completeFiles, 'src/pages/Menu.html': undefined },
  { pages: ['Home', 'About', 'Reservations', 'Contact'].map(title => ({ title })) },
);
assert.equal(missingPage.ok, false);
assert(missingPage.issues.some(issue => issue.code === 'EXPLICIT_PAGES_MISSING'));

const missingForm = verifyPromptContractOutput(
  'Create a one-page website with a contact form.',
  { 'index.html': '<!doctype html><html><head><title>Contact</title></head><body><h1>Contact us</h1></body></html>' },
  { pages: [{ title: 'Home' }] },
);
assert(missingForm.issues.some(issue => issue.code === 'CONTACT_FORM_MISSING'));

console.log('Web Studio prompt-contract tests passed.');
