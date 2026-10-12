/**
 * Prompt contract for OVYX Web Studio.
 *
 * Keeps explicit user requirements visible to planning and build stages, detects
 * critical missing public/business details before a new build, and avoids
 * inventing contact data or claiming integrations are configured when they are not.
 */

const MAX_PROMPT_CHARS = 30000;
const MAX_REQUIREMENTS = 28;

const PAGE_ALIASES = [
  { title: 'Home', pattern: /\b(?:home(?:page)?|landing page)\b/i },
  { title: 'About', pattern: /\b(?:about(?: us)?|our story)\b/i },
  { title: 'Services', pattern: /\b(?:services?|what we do)\b/i },
  { title: 'Features', pattern: /\bfeatures?\b/i },
  { title: 'Pricing', pattern: /\b(?:pricing|plans|price list|rates)\b/i },
  { title: 'Products', pattern: /\bproducts?\b/i },
  { title: 'Shop', pattern: /\b(?:shop|store|catalogue|catalog)\b/i },
  { title: 'Collections', pattern: /\bcollections?\b/i },
  { title: 'Menu', pattern: /\bmenus?\b/i },
  { title: 'Reservations', pattern: /\b(?:reservations?|bookings?)\b/i },
  { title: 'Contact', pattern: /\b(?:contact(?: us)?|get in touch)\b/i },
  { title: 'Location', pattern: /\b(?:locations?|find us)\b/i },
  { title: 'Gallery', pattern: /\bgalleries\b|\bgallery\b/i },
  { title: 'Portfolio', pattern: /\bportfolios?\b/i },
  { title: 'Projects', pattern: /\bprojects?\b/i },
  { title: 'Case Studies', pattern: /\bcase studies\b/i },
  { title: 'Blog', pattern: /\bblogs?\b/i },
  { title: 'FAQ', pattern: /\b(?:faqs?|frequently asked questions)\b/i },
  { title: 'Team', pattern: /\b(?:team|our people|staff)\b/i },
  { title: 'Testimonials', pattern: /\btestimonials?\b/i },
  { title: 'Events', pattern: /\bevents?\b/i },
  { title: 'Courses', pattern: /\b(?:courses?|programmes?|programs?)\b/i },
  { title: 'Admissions', pattern: /\badmissions?\b/i },
  { title: 'Resources', pattern: /\bresources?\b/i },
  { title: 'Support', pattern: /\bsupport\b/i },
  { title: 'Careers', pattern: /\bcareers?\b/i },
  { title: 'Privacy', pattern: /\bprivacy(?: policy)?\b/i },
  { title: 'Terms', pattern: /\b(?:terms|terms of service)\b/i },
  { title: 'Login', pattern: /\b(?:login|log in|sign in)\b/i },
  { title: 'Sign Up', pattern: /\b(?:sign ?up|register|create account)\b/i },
  { title: 'Dashboard', pattern: /\bdashboards?\b/i },
  { title: 'Cart', pattern: /\bcarts?\b/i },
  { title: 'Checkout', pattern: /\bcheckouts?\b/i },
  { title: 'Donations', pattern: /\b(?:donations?|donate)\b/i },
  { title: 'Volunteer', pattern: /\bvolunteers?\b/i },
];

const NON_REAL_EMAIL_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'domain.com',
  'yourdomain.com', 'company.com', 'email.com', 'placeholder.com',
]);

function clean(value, max = MAX_PROMPT_CHARS) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizedKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isRealPublicEmail(value) {
  const matches = clean(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  return matches.some(email => {
    const normalized = email.toLowerCase();
    const domain = normalized.split('@')[1] || '';
    return !NON_REAL_EMAIL_DOMAINS.has(domain) &&
      !/^(?:your|name|email|hello|contact)@/i.test(normalized) &&
      !/\+?\d{3,}@/.test(normalized);
  });
}

function hasPhoneNumber(value) {
  const matches = clean(value).match(/\+?\d[\d\s().-]{7,}\d/g) || [];
  return matches.some(match => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 && !/^0+$/.test(digits);
  });
}

function hasAddressValue(value) {
  return /\b(?:address|located at|visit us at|find us at)\s*[:\-]\s*(?!\[|\(|your\b|add\b|provide\b|placeholder\b|tbd\b|coming soon\b)[\w\d][^\n;]{4,}/i.test(clean(value));
}

function splitRequirements(prompt) {
  const source = clean(prompt);
  const pieces = source
    .split(/\n+|;\s*|(?<=[.!?])\s+(?=[A-Z0-9“"'])/u)
    .map(item => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(item => item.length >= 9);
  const seen = new Set();
  const output = [];
  for (const item of pieces) {
    const key = normalizedKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item.slice(0, 900));
    if (output.length >= MAX_REQUIREMENTS) break;
  }
  return output;
}

export function extractExplicitPageNames(prompt) {
  const source = clean(prompt);
  const multiPageSignal = /\b(?:multi[-\s]?page|multiple\s+pages?|several\s+pages?|\d+\s*[- ]?pages?|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:website|site|app|pages?|websites?)?\b/i.test(source) ||
    /\bpages?\s*(?:include|are|:|such as|named|will include)\b/i.test(source);
  if (!multiPageSignal) return [];

  const terms = [];
  for (const item of PAGE_ALIASES) {
    const match = item.pattern.exec(source);
    if (match) terms.push({ title: item.title, index: match.index, length: match[0].length });
  }
  terms.sort((a, b) => a.index - b.index);

  // Ignore page-like words used only in a "do not include" restriction.
  const exclusions = source.match(/\b(?:do not|don't|dont|never|avoid|exclude|without)\b[^.!?\n]{0,180}/ig) || [];
  const excludedNames = new Set();
  for (const exclusion of exclusions) {
    for (const item of PAGE_ALIASES) {
      if (item.pattern.test(exclusion)) excludedNames.add(item.title);
    }
  }

  const seen = new Set();
  return terms
    .filter(item => {
      const key = normalizedKey(item.title);
      if (seen.has(key) || excludedNames.has(item.title)) return false;
      seen.add(key);
      return true;
    })
    .map(item => item.title);
}

function publicContextText(value, key = '', depth = 0) {
  if (depth > 6 || value == null) return '';
  if (/(?:token|secret|password|credential|private.?key|authorization|auth|owner|account|billing|useremail|api.?key)/i.test(key)) return '';
  if (typeof value === 'string') {
    if (/(?:email|phone|contact|address|location|hours|business|brand|project|file|source|content|html|text|website|url|social|booking)/i.test(key)) {
      return value.slice(0, 12000);
    }
    return '';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 80).map(item => publicContextText(item, key, depth + 1)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 120);
    return entries.map(([childKey, child]) => publicContextText(child, childKey, depth + 1)).filter(Boolean).join('\n').slice(0, 36000);
  }
  return '';
}

function hasExplicitContactOptOut(prompt) {
  return /\b(?:do not|don't|dont|without)\s+(?:add|include|show|use|need)\s+(?:any\s+)?(?:contact|email|phone|address|booking|reservation|form)\b/i.test(prompt) ||
    /\b(?:use|leave|keep)\s+(?:clear(?:ly)?\s+)?(?:editable\s+)?placeholders?\b/i.test(prompt) ||
    /\b(?:placeholder|sample|demo|wireframe|prototype only|ui only|design only)\b/i.test(prompt) ||
    /\bdo not ask me questions\b/i.test(prompt);
}

function hasConnectedIntegration(context, kind) {
  const source = context && typeof context === 'object' ? context : {};
  const records = [
    source.connections, source.activeConnections, source.integrations,
    source.connectionStatus, source.connectedServices,
  ];
  const flatten = value => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === 'object') return [
      value,
      ...Object.values(value).flatMap(flatten),
    ];
    return [];
  };
  return flatten(records).some(item => {
    if (!item || typeof item !== 'object') return false;
    const identity = clean(item.provider || item.name || item.id || item.type || item.service, 120).toLowerCase();
    const connected = item.connected === true || item.status === 'connected' || item.state === 'connected' || item.isConnected === true;
    const relevant = kind === 'payments'
      ? /stripe|paypal|paystack|flutterwave|payment|checkout/.test(identity)
      : kind === 'email'
        ? /email|mailgun|sendgrid|resend|postmark|smtp/.test(identity)
        : /firebase|supabase|database|backend|auth|cloudflare/.test(identity);
    return connected && relevant;
  });
}

export function buildPromptContract(prompt) {
  const source = clean(prompt);
  const clauses = splitRequirements(source);
  const exclusions = clauses.filter(item => /\b(?:do not|don't|dont|never|avoid|exclude|without|no longer|only)\b/i.test(item));
  const required = clauses.filter(item => /\b(?:must|make sure|ensure|include|add|needs? to|should|with|keep|preserve|use|exactly|every|all|don't forget)\b/i.test(item));
  return {
    version: 1,
    sourceLength: source.length,
    userRequirements: required.slice(0, 20),
    allBriefClauses: clauses.slice(0, 20),
    explicitConstraints: exclusions.slice(0, 16),
    explicitPages: extractExplicitPageNames(source),
    contactSignals: {
      contactForm: /\b(?:contact|enquiry|inquiry|quote|lead|message)\s+forms?\b|\bforms?\b.{0,40}\b(?:contact|email|message|enquiry|inquiry|quote)\b/i.test(source),
      emailDelivery: /\b(?:send|deliver|email|notify|forward)\b.{0,55}\b(?:form|message|enquiry|inquiry|lead|submission)\b|\b(?:form|message|enquiry|inquiry|lead|submission)\b.{0,55}\b(?:send|deliver|email|notify|forward)\b/i.test(source),
      bookings: /\b(?:booking|bookings|reservation|reservations|appointments?|schedule a visit)\b/i.test(source),
      newsletter: /\b(?:newsletter|subscribe|subscription form)\b/i.test(source),
      payments: /\b(?:payments?|checkout|accept cards|paystack|flutterwave|stripe|paypal|buy now|subscriptions? billing)\b/i.test(source),
      authentication: /\b(?:login|log in|sign in|sign up|user accounts?|authentication|register an account)\b/i.test(source),
      backendData: /\b(?:save|store|persist|database|backend|customer records?|booking records?|order records?)\b/i.test(source),
    },
    fidelityRules: [
      'Treat every explicit requirement and exclusion as a delivery contract, not optional inspiration.',
      'Keep a private implementation checklist from the exact user brief; satisfy each item or clearly report what remains unresolved.',
      'Preserve existing project architecture and unrelated working features when editing a site.',
      'Never invent real contact details, prices, opening hours, addresses, testimonials, credentials, product claims or integration status.',
      'Do not present non-working buttons, fake form success, or unconnected payment/booking integrations as functional.',
      'If required factual details are missing, ask concise questions or use clearly editable placeholders only when the user authorizes placeholders.',
      'Do not expose chain-of-thought; provide a concise plan, observable progress and verification results instead.',
    ],
  };
}

export function getWebStudioBuildClarification(prompt, context = {}) {
  const source = clean(prompt);
  const conversationText = clean(context && context.conversationText);
  if (!source || hasExplicitContactOptOut(source) || hasExplicitContactOptOut(conversationText)) return null;

  const publicContext = publicContextText(context);
  const evidence = source + '\n' + conversationText + '\n' + publicContext;
  const hasEmail = isRealPublicEmail(evidence);
  const hasPhone = hasPhoneNumber(evidence);
  const hasAddress = hasAddressValue(evidence);
  const contract = buildPromptContract(source);
  const contact = contract.contactSignals;

  const specificEmailForm = contact.contactForm && contact.emailDelivery;
  const wantsBusinessSite = /\b(?:restaurant|cafe|coffee shop|hotel|clinic|hospital|dentist|doctor|pharmacy|church|school|college|university|academy|agency|business|company|consultancy|salon|barbershop|gym|fitness studio|real estate|property|law firm|accounting firm|charity|nonprofit|ngo|portfolio|photographer|architect|contractor|plumber|electrician)\b/i.test(source);
  const asksContactInfo = /\b(?:contact|email|phone|telephone|whatsapp|address|location|opening hours|business hours|reservation|appointment|booking|enquiry|inquiry|quote request|newsletter|subscribe)\b/i.test(source);
  const asksPayment = contact.payments && !/\b(?:ui only|design only|mockup only|prototype only|no real payments|checkout mockup)\b/i.test(source);
  const asksBackend = contact.backendData && /\b(?:real|working|live|actually|save|store|receive|send|connect|integrate)\b/i.test(source);
  const explicitPlaceholder = /\b(?:use|leave|keep|put)\b.{0,35}\bplaceholders?\b/i.test(source);
  const questions = [];

  if (specificEmailForm && !hasEmail) {
    questions.push('What public email address should receive messages from this form? Please share the address only, never a password or API key.');
  } else if ((wantsBusinessSite || asksContactInfo) && !hasEmail && !hasPhone && !hasAddress && !explicitPlaceholder) {
    questions.push('To make the contact section useful, share any public business email, phone/WhatsApp number, address, opening hours, or booking link you want visitors to see. Send only what applies; I will not invent missing details.');
  }

  if (asksPayment && !hasConnectedIntegration(context, 'payments')) {
    const selectedProvider = /\b(paystack|flutterwave|stripe|paypal)\b/i.exec(evidence);
    if (selectedProvider) {
      const providerName = selectedProvider[1][0].toUpperCase() + selectedProvider[1].slice(1).toLowerCase();
      questions.push('You selected ' + providerName + '. Connect it under OVYX Settings & Connections; do not paste secret keys into chat. I can prepare the checkout UI now, but I will not claim real payments work until the connection is active.');
    } else {
      questions.push('For real payments, which provider should the site use? Connect it under OVYX Settings & Connections; do not paste secret keys into chat. I can build the storefront now, but I will not pretend checkout works before the provider is connected.');
    }
  }

  if ((contact.authentication || asksBackend) && !hasConnectedIntegration(context, 'backend') &&
      /\b(?:real|working|live|save|store|customer accounts?|database|booking records?|order records?)\b/i.test(source)) {
    questions.push('This request needs a real login/database/backend connection. Should I prepare the website UI now and mark the integration as pending, or do you want to connect a supported service in Settings & Connections first? Never send passwords or secret keys in chat.');
  }

  if (!questions.length) return null;
  const limited = questions.slice(0, 3);
  return {
    type: 'build_readiness',
    questions: limited,
    message: 'Before I build this, I need a couple of details so the result matches your request and does not pretend missing services are connected.\n\n' +
      limited.map((question, index) => (index + 1) + '. ' + question).join('\n\n') +
      '\n\nReply with the details you have, or say “use editable placeholders” / “build the UI only” to continue without inventing facts.',
  };
}


/**
 * Deterministic, conservative post-build checks for requirements that can be
 * verified from generated files without pretending to run a browser.
 */
export function verifyPromptContractOutput(prompt, files, siteMap = {}) {
  const contract = buildPromptContract(prompt);
  const entries = Object.entries(files && typeof files === 'object' && !Array.isArray(files) ? files : {})
    .filter(([, value]) => typeof value === 'string' && value.trim());
  const htmlEntries = entries.filter(([path]) => /\.html?$/i.test(path));
  const allText = entries.map(([, value]) => value).join('\n');
  const htmlText = htmlEntries.map(([, value]) => value).join('\n');
  const pageEntries = Array.isArray(siteMap && siteMap.pages) ? siteMap.pages : [];
  const pageKeys = new Set(pageEntries.map(page => normalizedKey(page && (page.title || page.name))).filter(Boolean));
  for (const [path] of htmlEntries) {
    const basename = path.split('/').pop().replace(/\.html?$/i, '').replace(/[-_]+/g, ' ');
    if (/^(?:home|index)$/i.test(basename)) pageKeys.add('home');
    pageKeys.add(normalizedKey(basename));
  }

  const issues = [];
  const missingPages = contract.explicitPages.filter(title => {
    const key = normalizedKey(title);
    return !pageKeys.has(key) && !(key === 'home' && pageKeys.has('index'));
  });
  if (missingPages.length) {
    issues.push({
      code: 'EXPLICIT_PAGES_MISSING',
      message: 'The generated site is missing explicitly requested pages: ' + missingPages.join(', '),
      missing: missingPages,
    });
  }

  if (contract.contactSignals.contactForm && !/<form\b/i.test(htmlText)) {
    issues.push({
      code: 'CONTACT_FORM_MISSING',
      message: 'The brief explicitly asks for a contact/enquiry form, but no HTML form was generated.',
    });
  }
  if (contract.contactSignals.newsletter && !/(?:newsletter|subscribe|subscription)/i.test(allText)) {
    issues.push({
      code: 'NEWSLETTER_MISSING',
      message: 'The brief asks for a newsletter/subscription experience, but no matching content was generated.',
    });
  }
  if (contract.contactSignals.authentication && !/(?:log\s*in|login|sign\s*in|sign\s*up|register|create account)/i.test(allText)) {
    issues.push({
      code: 'AUTHENTICATION_UI_MISSING',
      message: 'The brief asks for authentication, but no login/register experience was generated.',
    });
  }
  if (contract.contactSignals.payments && !/(?:checkout|payment|paystack|flutterwave|stripe|paypal)/i.test(allText)) {
    issues.push({
      code: 'PAYMENT_FLOW_MISSING',
      message: 'The brief asks for payments/checkout, but no checkout or payment-related UI was generated.',
    });
  }

  return {
    ok: issues.length === 0,
    requirementCount: contract.allBriefClauses.length,
    explicitPages: contract.explicitPages,
    checkedFiles: entries.length,
    checkedHtmlFiles: htmlEntries.length,
    issues,
  };
}
