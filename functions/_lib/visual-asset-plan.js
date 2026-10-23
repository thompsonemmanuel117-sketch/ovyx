const ASSETS = {
  realEstate: ['authentic property and architectural photography', 'property gallery images with consistent crops', 'agent portraits only when supplied or explicitly sourced'],
  restaurant: ['dish photography and food-detail imagery', 'menu/category visuals where useful'],
  ecommerce: ['consistent product photography across catalogue and detail views', 'merchant-supplied product variants'],
  fashion: ['editorial campaign imagery', 'consistent product-detail photography and collection visuals'],
  hospitality: ['room, amenity and destination photography', 'galleries tied to the actual property or place'],
  travel: ['destination photography tied to the itinerary', 'maps or route illustrations only when useful'],
  saas: ['supplied or genuinely rendered product screenshots', 'purposeful diagrams rather than fake customer logos'],
  generic: ["assets specific to the user's described concept and audience", 'a distinctive brand mark or lightweight SVG when no logo is supplied'],
};
export function buildVisualAssetPlan(prompt = '', context = {}, archetype = 'generic') {
  const brief = String(prompt || '').slice(0, 80000);
  const assets = Array.isArray(context?.assets) ? context.assets.slice(0, 80) : [];
  const suppliedAssets = assets.map(item => typeof item === 'string' ? item.slice(0, 180) : item && typeof item === 'object' ? String(item.name || item.path || item.url || item.type || '').slice(0, 180) : '').filter(Boolean);
  const motionRequested = /\b(?:animation|animated|motion|parallax|scroll[- ]?reveal|microinteraction|micro-interaction|cinematic|3d|gsap|lottie)\b/i.test(brief);
  const imageHeavy = /\b(?:photography|photographs|photos|images|gallery|property|real estate|restaurant|food|fashion|products|hotel|travel|portfolio|showcase)\b/i.test(brief) || ['realEstate','restaurant','ecommerce','fashion','hospitality','travel'].includes(archetype);
  return {
    artDirection: 'Choose a distinctive art direction before selecting assets; do not reuse the same hero, card grid, gradients or image style across unrelated projects.',
    requiredAssetKinds: ASSETS[archetype] || ASSETS.generic, suppliedAssets, imageHeavy, motionRequested,
    imageStrategy: [
      'Prefer supplied/project-owned assets and preserve the actual brand identity.',
      'Never fabricate remote image URLs or claim image licensing/source verification that did not happen.',
      'If an asset is missing, use an honest designed fallback and report the missing asset; do not leave broken images or unrelated stock imagery.',
      'Use descriptive alt text for meaningful images, deliberate aspect ratios/crops, responsive sizing and lazy-loading below the fold.',
    ],
    motionPlan: [
      motionRequested ? 'Implement requested motion with real CSS/JS or supplied animation assets, purposeful timing and transform/opacity where appropriate.' : 'Use restrained motion only when it clarifies hierarchy or state.',
      'Respect prefers-reduced-motion and keep a usable non-animated fallback.',
      'Check animation at real viewport sizes; motion must not block navigation or primary controls.',
    ],
    responsiveTargets: [{width:320,height:720},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900}],
    visualAcceptanceCriteria: [
      'Review rendered screenshots for art direction, hierarchy, spacing, image crops and section rhythm; static source scores are not visual scores.',
      'Check broken images, blank hero areas, horizontal overflow, clipping, and obstructed navigation/actions at responsive widths.',
      'Check keyboard access, reduced-motion behavior, page/console errors and the primary interaction journey.',
      'Record viewports, screenshots, errors and untested behavior; missing artifacts or untested routes are not passes.',
    ],
  };
}
