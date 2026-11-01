const MAX_REQUIREMENTS = 180;
const NEGATION = /\b(?:do not|don't|dont|must not|mustn't|never|exclude|excluding|without|avoid|avoids|no)\b/i;
const STRONG = /\b(?:must|required|mandatory|always|never|must not|mustn't)\b/i;
const STOP = new Set(['the','and','for','with','from','that','this','then','than','into','onto','your','you','our','their','them','they','are','was','were','will','shall','can','could','should','would','make','made','have','has','had','use','using','used','include','including','provide','ensure','keep','keep','not','dont','don','must','never','avoid','without','only','also','all','any','each','every','where','when','what','who','how','its','it','a','an','to','of','in','on','at','by','as','is','be','or','but']);
const RULES = [
  ['security', /\b(?:security|secure|secret|credential|private|encrypt|csrf|xss|injection|rate.?limit|permission|authorization|privacy|personal data)\b/i],
  ['identity', /\b(?:login|log in|sign.?in|sign.?up|register|account|authentication|identity|role.?based|user role|admin access)\b/i],
  ['data', /\b(?:database|persist|storage|save|record|schema|migration|firestore|d1|sql|data model)\b/i],
  ['commerce', /\b(?:payment|checkout|cart|basket|order|subscription|billing|invoice|product price)\b/i],
  ['integration', /\b(?:api|webhook|provider|integration|send email|email delivery|third.party|external service)\b/i],
  ['routes', /\b(?:page|route|url|navigation|nav|sitemap|multi.page|homepage|landing page)\b/i],
  ['interaction', /\b(?:button|form|menu|modal|dialog|tab|accordion|search|filter|submit|workflow|interaction|click)\b/i],
  ['design', /\b(?:design|visual|layout|colour|color|typography|font|spacing|animation|motion|brand|style|theme|aesthetic)\b/i],
  ['content', /\b(?:content|copy|text|headline|description|faq|testimonial|review|story|article|blog)\b/i],
  ['responsive', /\b(?:responsive|mobile|tablet|desktop|breakpoint|viewport|screen size)\b/i],
  ['accessibility', /\b(?:accessibility|accessible|wcag|aria|keyboard|screen reader|focus state|contrast)\b/i],
  ['performance', /\b(?:performance|fast|speed|load time|lazy load|bundle|core web vitals|cache)\b/i],
  ['seo', /\b(?:seo|meta description|metadata|structured data|schema.org|sitemap|robots.txt|open graph)\b/i],
  ['assets', /\b(?:image|photo|video|icon|logo|font file|upload|media|asset|gallery)\b/i],
  ['localization', /\b(?:locale|locali[sz]ation|currency|timezone|time zone|language|translation|region)\b/i],
  ['constraints', /\b(?:exactly|only|must|must not|never|exclude|without|avoid|preserve|keep existing|do not|don't)\b/i],
];
function clean(value, max = 900) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function splitRequirement(value, index) {
  const source = clean(value);
  const match = source.match(/^(R\d{1,4}):\s*/);
  return {
    id: match ? match[1] : 'R' + String(index + 1).padStart(3, '0'),
    text: clean(source.replace(/^R\d{1,4}:\s*/, '')),
  };
}
function tokens(text) {
  return [...new Set(clean(text, 900).toLowerCase()
    .replace(/\b(?:do not forget|don't forget|dont forget)\b/g, ' remember ')
    .replace(/\b(?:do not|don't|dont|must not|mustn't|should not|shouldn't|cannot|can't|never|exclude|excluding|without|avoid|avoids)\b/g, ' ')
    .replace(/\bno\s+(?=(?:login|sign.?in|account|payment|checkout|tracking|analytics|cookies?|external|third.party|pop.?ups?|animations?|images?|video|forms?|database|email|newsletter|ads?)\b)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP.has(token)))];
}
function signature(text) {
  return tokens(text).sort().join(' ');
}
function negationEvidence(text) {
  const source = clean(text, 900)
    .replace(/\b(?:do not forget|don't forget|dont forget)\b/ig, ' ')
    .replace(/\bnot only\b/ig, ' ')
    .replace(/\bno (?:later than|more than|less than)\b/ig, ' ');
  return source.match(/\b(?:do not|don't|dont|must not|mustn't|should not|shouldn't|cannot|can't|never|exclude|excluding|without|avoid|avoids)\b|^\s*no\b|\bno\s+(?=(?:login|sign.?in|account|payment|checkout|tracking|analytics|cookies?|external|third.party|pop.?ups?|animations?|images?|video|forms?|database|email|newsletter|ads?)\b)/ig) || [];
}
function polarity(text) {
  if (negationEvidence(text).length) return 'prohibited';
  if (/\b(?:must|required|mandatory|always|include|implement|build|create|add|provide|ensure|persist|keep|use|support|connect|send|store|validate|display|show|render|deliver|generate|design|write|maintain|preserve|enable|allow|accept|handle)\b/i.test(text)) return 'required';
  return 'preference';
}
function similarity(left, right) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size < 3 || b.size < 3) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
function categories(text) {
  return RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

/**
 * Converts the prompt contract into a traceable, deterministic requirement ledger.
 * It does not pretend to replace semantic model reasoning: uncertain mappings and
 * contradictory instructions remain explicit and require reconciliation.
 */
export function buildRequirementIntelligence(prompt, contract = {}, architecture = {}) {
  const raw = Array.isArray(contract.allBriefClauses) ? contract.allBriefClauses : [];
  const source = raw.slice(0, MAX_REQUIREMENTS).map(splitRequirement);
  const mappings = new Map((Array.isArray(architecture.requirementMappings) ? architecture.requirementMappings : [])
    .map(item => [String(item.requirementId || ''), item]));
  const requirements = source.map(item => {
    const category = categories(item.text);
    const intent = polarity(item.text);
    const mapping = mappings.get(item.id);
    const targets = Array.isArray(mapping?.targetNodeIds) ? mapping.targetNodeIds.filter(Boolean).slice(0, 8) : [];
    const critical = category.some(value => ['security','identity','data','commerce'].includes(value));
    return {
      id: item.id,
      text: item.text,
      sourceText: item.text,
      polarity: intent,
      negationEvidence: negationEvidence(item.text),
      strength: STRONG.test(item.text) && intent !== 'prohibited' ? 'mandatory' : intent === 'required' ? 'requested' : intent === 'prohibited' ? 'prohibited' : 'preference',
      confidence: STRONG.test(item.text) || negationEvidence(item.text).length ? 'high' : category.length ? 'medium' : 'low',
      categories: category.length ? category : ['general'],
      priority: critical ? 'critical' : category.some(value => ['routes','interaction','integration'].includes(value)) ? 'high' : 'normal',
      targetNodeIds: targets,
      mappingStatus: targets.length ? 'mapped' : 'unmapped',
      dependencyRequirementIds: Array.isArray(mapping?.dependencyRequirementIds) ? mapping.dependencyRequirementIds.slice(0, 12).map(String) : [],
      acceptanceCriteria: Array.isArray(mapping?.acceptanceCriteria) ? mapping.acceptanceCriteria.slice(0, 8).map(value => clean(value, 240)) : [],
      architectureAssessment: clean(mapping?.assessment || 'not-mapped', 80),
      acceptanceEvidence: 'not-generated',
    };
  });
  const knownIds = new Set(requirements.map(item => item.id));
  for (const item of requirements) {
    item.dependencyRequirementIds = [...new Set(item.dependencyRequirementIds)]
      .filter(id => id !== item.id && knownIds.has(id));
  }
  const conflicts = [];
  for (let left = 0; left < requirements.length && conflicts.length < 24; left += 1) {
    for (let right = left + 1; right < requirements.length && conflicts.length < 24; right += 1) {
      const a = requirements[left];
      const b = requirements[right];
      if ((a.polarity === 'prohibited') === (b.polarity === 'prohibited')) continue;
      const score = similarity(a.text, b.text);
      if (score < 0.72) continue;
      const shared = tokens(a.text).filter(token => tokens(b.text).includes(token));
      conflicts.push({
        requirementIds: [a.id, b.id],
        sharedIntent: shared.join(' ').slice(0, 180),
        similarity: Number(score.toFixed(3)),
        status: 'conflict-needs-reconciliation',
        instruction: 'Do not silently choose one; resolve against the complete conversation or ask the user.',
      });
    }
  }
  const counts = {
    total: requirements.length,
    required: requirements.filter(item => item.polarity === 'required').length,
    prohibited: requirements.filter(item => item.polarity === 'prohibited').length,
    preferences: requirements.filter(item => item.polarity === 'preference').length,
    critical: requirements.filter(item => item.priority === 'critical').length,
    mapped: requirements.filter(item => item.mappingStatus === 'mapped').length,
    unmapped: requirements.filter(item => item.mappingStatus === 'unmapped').length,
    conflicts: conflicts.length,
    sourceComplete: contract.requirementManifestComplete === true,
    sourceOmitted: Number(contract.omittedRequirementClauseCount) || 0,
  };
  return {
    version: 1,
    engine: 'ovyx-requirement-intelligence',
    status: !counts.sourceComplete || counts.sourceOmitted > 0 ? 'bounded-partial' : conflicts.length ? 'conflicts-detected' : counts.unmapped ? 'traceability-gaps' : 'ledger-built',
    counts,
    requirements,
    conflicts,
    unmappedRequirementIds: requirements.filter(item => item.mappingStatus === 'unmapped').map(item => item.id),
    rules: [
      'The complete original brief remains authoritative; this ledger is a deterministic aid, not a semantic replacement.',
      'Preserve prohibited requirements as hard exclusions and do not convert them into optional preferences.',
      'Every unmapped requirement must remain visible; never silently count it as implemented.',
      'Conflicting instructions remain unresolved until the conversation or user clarifies them.',
      'Acceptance evidence remains not-generated until source, tests or browser evidence actually exist.',
    ],
  };
}
