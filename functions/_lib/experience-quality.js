/** Static-source quality checks only; never claim browser, visual, WCAG or live-service proof. */
const s=v=>String(v??'');
const a=(tag,n)=>{const m=s(tag).match(new RegExp('\\b'+n+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i'));return m?s(m[1]??m[2]??m[3]).trim():''};
export function auditExperienceQuality(files={},siteMap={}){
 const allEntries=Object.entries(files||{}), entries=allEntries.filter(([p])=>/\.html?$/i.test(p)||/\.css$/i.test(p)), html=entries.filter(([p])=>/\.html?$/i.test(p)), css=entries.filter(([p])=>/\.css$/i.test(p)).map(([,v])=>s(v)).join('\n'), findings=[];
 const add=(code,file,severity,message)=>findings.push({code,file,severity,message});
 const titleOwners=new Map(), descriptionOwners=new Map();
 for(const [file,raw] of html){const h=s(raw);
 const titleText=(h.match(/<title[^>]*>([^<]*)/i)||[])[1]?.trim().toLowerCase();
 if(titleText){if(titleOwners.has(titleText))add('DUPLICATE_PAGE_TITLE',file,'warning','Document title duplicates '+titleOwners.get(titleText)+'.');else titleOwners.set(titleText,file);}
 const descriptionTag=[...h.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]).find(x=>a(x,'name').toLowerCase()==='description');
 const descriptionText=descriptionTag?a(descriptionTag,'content').toLowerCase():'';
 if(descriptionText){if(descriptionOwners.has(descriptionText))add('DUPLICATE_META_DESCRIPTION',file,'warning','Meta description duplicates '+descriptionOwners.get(descriptionText)+'.');else descriptionOwners.set(descriptionText,file);}
 if(!/og:title/i.test(h))add('OPEN_GRAPH_TITLE_MISSING',file,'info','No Open Graph title was detected.');
 if(!/og:description/i.test(h))add('OPEN_GRAPH_DESCRIPTION_MISSING',file,'info','No Open Graph description was detected.');
 if(!/og:image/i.test(h))add('OPEN_GRAPH_IMAGE_MISSING',file,'info','No Open Graph preview image was detected.');
 if(!/twitter:card/i.test(h))add('TWITTER_CARD_METADATA_MISSING',file,'info','No Twitter/X card metadata was detected.');
 const canonicalLinks=[...h.matchAll(/<link\b[^>]*>/gi)].filter(x=>/\brel\s*=\s*["']canonical["']/i.test(x[0]));
 if(canonicalLinks.length>1)add('MULTIPLE_CANONICAL_LINKS',file,'warning','More than one canonical link was detected.');
 if(canonicalLinks.length===1&&!a(canonicalLinks[0][0],'href'))add('CANONICAL_HREF_MISSING',file,'warning','Canonical link has no href.');
 for(const data of h.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
   try{const parsed=JSON.parse(data[1]);const hasTypedNode=(value,inheritedContext=false)=>{if(Array.isArray(value))return value.some(item=>hasTypedNode(item,inheritedContext));if(!value||typeof value!=='object')return false;const context=Boolean(value['@context'])||inheritedContext;const type=value['@type'];const typed=typeof type==='string'?Boolean(type.trim()):Array.isArray(type)&&type.length>0;if(context&&typed)return true;return Array.isArray(value['@graph'])&&value['@graph'].some(item=>hasTypedNode(item,context));};if(!hasTypedNode(parsed))add('STRUCTURED_DATA_SHAPE_INVALID',file,'warning','JSON-LD must contain a typed node with an explicit or inherited @context.');}
   catch{add('STRUCTURED_DATA_JSON_INVALID',file,'warning','A JSON-LD script contains invalid JSON.');}
 }
 if(!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(h))add('PAGE_TITLE_MISSING',file,'warning','No non-empty document title.');
 if(!/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(h)&&!/<meta\b[^>]*content\s*=\s*["'][^"']+["'][^>]*name\s*=\s*["']description["']/i.test(h))add('META_DESCRIPTION_MISSING',file,'warning','No non-empty meta description.');
 if(!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(h))add('VIEWPORT_META_MISSING',file,'warning','No viewport metadata.');
 if(!/<html\b[^>]*\blang\s*=/i.test(h))add('DOCUMENT_LANGUAGE_MISSING',file,'warning','No document language.');
 if(!/<h1\b/i.test(h))add('PRIMARY_HEADING_MISSING',file,'warning','No h1 heading.');
 if(!/<main\b/i.test(h))add('MAIN_LANDMARK_MISSING',file,'warning','No main landmark.');
 const headingLevels=[...h.matchAll(/<h([1-6])\b/gi)].map(x=>Number(x[1]));
 for(let i=1;i<headingLevels.length;i++)if(headingLevels[i]>headingLevels[i-1]+1){add('HEADING_LEVEL_SKIPPED',file,'warning','Heading hierarchy skips from h'+headingLevels[i-1]+' to h'+headingLevels[i]+'.');break;}
 for(const m of h.matchAll(/<img\b[^>]*>/gi)){const tag=m[0],start=m.index??0;if(!/\balt\s*=/i.test(tag))add('IMAGE_ALT_ATTRIBUTE_MISSING',file,'warning','Image has no alt attribute.');if(!/\b(?:width|height)\s*=/i.test(tag))add('IMAGE_DIMENSIONS_UNDECLARED',file,'info','Image has no intrinsic dimensions.');const pictureStart=h.lastIndexOf('<picture',start),pictureEnd=h.indexOf('</picture',start),pictureSource=pictureStart>=0&&pictureEnd>start&&/<source\b[^>]*srcset\s*=/i.test(h.slice(pictureStart,pictureEnd));if(!a(tag,'srcset')&&!pictureSource)add('IMAGE_RESPONSIVE_SOURCE_NOT_DECLARED',file,'info','Image has no srcset or picture source; review responsive asset delivery for large or art-directed imagery.');if(a(tag,'srcset')&&!a(tag,'sizes'))add('IMAGE_SIZES_ATTRIBUTE_MISSING',file,'info','Responsive srcset is present without a sizes hint.');}
 for(const m of h.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi))if(!m[0].replace(/<[^>]*>/g,'').trim()&&!a(m[0],'aria-label')&&!a(m[0],'aria-labelledby'))add('BUTTON_NAME_MISSING',file,'warning','Button has no detectable accessible name.');
 for(const m of h.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)){const tag=m[0],label=tag.replace(/<[^>]*>/g,'').trim();if(!a(tag,'href')||a(tag,'href')==='#')add('ANCHOR_DESTINATION_MISSING',file,'warning','Anchor has no meaningful destination.');if(!label&&!a(tag,'aria-label')&&!a(tag,'aria-labelledby'))add('ANCHOR_NAME_MISSING',file,'warning','A link has no detectable accessible name.');}
 for(const m of h.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)){const t=m[0],type=a(t,'type').toLowerCase();if(/^<input\b/i.test(t)&&['hidden','submit','button','reset'].includes(type))continue;if(!a(t,'aria-label')&&!a(t,'aria-labelledby')&&!a(t,'id'))add('FORM_CONTROL_NAME_UNDETECTABLE',file,'warning','Form control has no detectable accessible-name or label target.');}
 }
 if(!allEntries.some(([p])=>/^robots\.txt$/i.test(p)))add('ROBOTS_POLICY_NOT_INCLUDED','robots.txt','info','No root robots.txt file is included; confirm the indexing policy before publishing.');
 if(!allEntries.some(([p])=>/^sitemap\.xml$/i.test(p)))add('SITEMAP_NOT_INCLUDED','sitemap.xml','info','No root sitemap.xml file is included; generate one for public multi-route sites where appropriate.');
 if(entries.some(([p])=>/\.css$/i.test(p))){if(!/@media\b/i.test(css))add('RESPONSIVE_MEDIA_RULES_NOT_DETECTED','stylesheets','warning','No media query; browser responsive review required.');if(!/prefers-reduced-motion\s*:\s*reduce/i.test(css))add('REDUCED_MOTION_RULE_NOT_DETECTED','stylesheets','warning','No reduced-motion rule.');if(!/:focus-visible\b/i.test(css))add('VISIBLE_FOCUS_RULE_NOT_DETECTED','stylesheets','warning','No focus-visible rule.');}
 const counts=findings.reduce((o,x)=>(o[x.severity]=(o[x.severity]||0)+1,o),{});
 return {status:findings.some(x=>x.severity==='warning')?'review-required':'source-checks-clear',scope:'static-source-only',checkedHtmlFiles:html.length,checkedCssFiles:entries.length-html.length,declaredRouteCount:Array.isArray(siteMap?.pages)?siteMap.pages.length:html.length,findings:findings.slice(0,150),totalFindings:findings.length,counts,evidence:{source:'checked',renderedVisuals:'not-verified',browserInteractions:'not-verified',responsiveRendering:'not-verified',wcagConformance:'not-verified',externalAssets:'not-verified',liveIntegrations:'not-verified',searchRankings:'not-verified'},summary:findings.length?findings.length+' source-level findings require review; browser and human verification remain separate.':'No findings from included source checks; this is not proof of rendered quality or conformance.'};
}