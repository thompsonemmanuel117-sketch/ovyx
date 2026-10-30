/**
 * Visual asset planning is concept-led, not industry-led. The exact brief and
 * project assets decide whether photography, diagrams, screenshots, portraits
 * or other media are needed; no vertical preset can make an asset mandatory.
 */
export function buildVisualAssetPlan(prompt = '', context = {}) {
  const brief = String(prompt || '').slice(0, 80000);
  const assets = Array.isArray(context?.assets) ? context.assets.slice(0, 80) : [];
  const suppliedAssets = assets.map(item =>
    typeof item === 'string'
      ? item.slice(0, 180)
      : item && typeof item === 'object'
        ? String(item.name || item.path || item.url || item.type || '').slice(0, 180)
        : ''
  ).filter(Boolean);

  const motionRequested = /\b(?:animation|animated|motion|parallax|scroll[- ]?reveal|microinteraction|micro-interaction|cinematic|3d|gsap|lottie)\b/i.test(brief);
  const requestedKinds = [];
  const addWhen = (pattern, value) => {
    if (pattern.test(brief)) requestedKinds.push(value);
  };

  addWhen(/\b(?:photography|photographs|photos|images|image-led|gallery|picture gallery|visual portfolio|lookbook)\b/i,
    'A coherent set of images or photography that matches the actual subject, visual tone and requested content.');
  addWhen(/\b(?:product|catalogue|catalog|inventory|variants|item detail)\b/i,
    'Consistent item imagery and detail views only for items that genuinely need visual inspection.');
  addWhen(/\b(?:team|people|staff|members|founders|speaker|author|profile portrait)\b/i,
    'Authentic portraits or profile imagery only when real supplied or approved assets exist.');
  addWhen(/\b(?:diagram|architecture|process|workflow|system map|data flow|blueprint)\b/i,
    'Purposeful diagrams or visual explanations that clarify the requested process or system.');
  addWhen(/\b(?:map|location|route|itinerary|directions|geographic)\b/i,
    'Maps or route visuals only when accurate location or route data is available.');
  addWhen(/\b(?:video|reel|film|motion graphic|animation asset)\b/i,
    'Video or motion assets only where explicitly requested and technically supported.');
  addWhen(/\b(?:screenshot|product interface|app preview|device mockup|software preview)\b/i,
    'Genuine product screenshots or carefully labelled interface mockups; never fake a connected or working product.');

  if (!requestedKinds.length) {
    requestedKinds.push('Only assets that directly improve comprehension, task completion, trust or the requested art direction; do not add imagery merely to fill space.');
  }
  if (suppliedAssets.length) {
    requestedKinds.unshift('Prioritize the supplied project assets and preserve their identity, dimensions and intended use where appropriate.');
  }

  const imageHeavy = requestedKinds.length > 1 ||
    /\b(?:image-led|gallery|photo gallery|lookbook|visual portfolio|photography|photographs|photos|video)\b/i.test(brief) ||
    suppliedAssets.some(asset => /\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm)(?:[?#].*)?$/i.test(asset));
  return {
    artDirection: 'Choose a distinctive art direction from the actual purpose, audience, content and brand; do not reuse a generic hero, card grid, gradient or image style across unrelated projects.',
    requiredAssetKinds: [...new Set(requestedKinds)].slice(0, 10),
    suppliedAssets,
    imageHeavy,
    motionRequested,
    imageStrategy: [
      'Prefer supplied/project-owned assets and preserve the actual brand identity.',
      'Never fabricate remote image URLs or claim image licensing/source verification that did not happen.',
      'If an asset is missing, use an honest designed fallback and report the missing asset; do not leave broken images or unrelated stock imagery.',
      'Use descriptive alt text for meaningful images, deliberate aspect ratios/crops, responsive sizing and lazy-loading below the fold.',
      'Use CSS, inline SVG or native interface elements instead of decorative images when they communicate the information more clearly.',
    ],
    motionPlan: [
      motionRequested
        ? 'Implement requested motion with real CSS/JS or supplied animation assets, purposeful timing and transform/opacity where appropriate.'
        : 'Use restrained motion only when it clarifies hierarchy, feedback or state.',
      'Respect prefers-reduced-motion and keep a usable non-animated fallback.',
      'Check animation at real viewport sizes; motion must not block navigation or primary controls.',
    ],
    responsiveTargets: [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ],
    visualAcceptanceCriteria: [
      'Review rendered screenshots for art direction, hierarchy, spacing, image crops and section rhythm; static source scores are not visual scores.',
      'Check broken images, blank hero areas, horizontal overflow, clipping, and obstructed navigation/actions at responsive widths.',
      'Check keyboard access, reduced-motion behavior, page/console errors and the primary interaction journey.',
      'Record viewports, screenshots, errors and untested behavior; missing artifacts or untested routes are not passes.',
    ],
  };
}
