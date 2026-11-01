/** Static-source quality checks only; never claim browser, visual, WCAG or live-service proof. */
const s=v=>String(v??'');
const a=(tag,n)=>{const m=s(tag).match(new RegExp('\\b'+n+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i'));return m?s(m[1]??m[2]??m[3]).trim():''};
export function auditExperienceQuality(files={},siteMap={}){
 const entries=Object.entries(files||{}), html=entries.filter(([p])=>/\.html?$/i.test(p)), css=entries.filter(([p])=>/\.css$/i.test(p)).map(([,v])=>s(v)).join('\n'), findings=[];
 const add=(code,file,severity,message)=>findings.push({code,file,severity,message});
 for(const [file,raw] of html){const h=s(raw);
 if(!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(h))add('PAGE_TITLE_MISSING',file,'warning','No non-empty document title.');
 if(!/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(h)&&!/<meta\b[^>]*content\s*=\s*["'][^"']+["'][^>]*name\s*=\s*["']description["']/i.test(h))add('META_DESCRIPTION_MISSING',file,'warning','No non-empty meta description.');
 if(!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(h))add('VIEWPORT_META_MISSING',file,'warning','No viewport metadata.');
 if(!/<html\b[^>]*\blang\s*=/i.test(h))add('DOCUMENT_LANGUAGE_MISSING',file,'warning','No document language.');
 if(!/<h1\b/i.test(h))add('PRIMARY_HEADING_MISSING',file,'warning','No h1 heading.');
 if(!/<main\b/i.test(h))add('MAIN_LANDMARK_MISSING',file,'warning','No main landmark.');
 for(const m of h.matchAll(/<img\b[^>]*>/gi)){if(!/\balt\s*=/i.test(m[0]))add('IMAGE_ALT_ATTRIBUTE_MISSING',file,'warning','Image has no alt attribute.');if(!/\b(?:width|height)\s*=/i.test(m[0]))add('IMAGE_DIMENSIONS_UNDECLARED',file,'info','Image has no intrinsic dimensions.');}
 for(const m of h.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi))if(!m[0].replace(/<[^>]*>/g,'').trim()&&!a(m[0],'aria-label')&&!a(m[0],'aria-labelledby'))add('BUTTON_NAME_MISSING',file,'warning','Button has no detectable accessible name.');
 for(const m of h.matchAll(/<a\b[^>]*>/gi))if(!a(m[0],'href')||a(m[0],'href')==='#')add('ANCHOR_DESTINATION_MISSING',file,'warning','Anchor has no meaningful destination.');
 for(const m of h.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)){const t=m[0],type=a(t,'type').toLowerCase();if(/^<input\b/i.test(t)&&['hidden','submit','button','reset'].includes(type))continue;if(!a(t,'aria-label')&&!a(t,'aria-labelledby')&&!a(t,'id'))add('FORM_CONTROL_NAME_UNDETECTABLE',file,'warning','Form control has no detectable accessible-name or label target.');}
 }
 if(entries.some(([p])=>/\.css$/i.test(p))){if(!/@media\b/i.test(css))add('RESPONSIVE_MEDIA_RULES_NOT_DETECTED','stylesheets','warning','No media query; browser responsive review required.');if(!/prefers-reduced-motion\s*:\s*reduce/i.test(css))add('REDUCED_MOTION_RULE_NOT_DETECTED','stylesheets','warning','No reduced-motion rule.');if(!/:focus-visible\b/i.test(css))add('VISIBLE_FOCUS_RULE_NOT_DETECTED','stylesheets','warning','No focus-visible rule.');}
 const counts=findings.reduce((o,x)=>(o[x.severity]=(o[x.severity]||0)+1,o),{});
 return {status:findings.some(x=>x.severity==='warning')?'review-required':'source-checks-clear',scope:'static-source-only',checkedHtmlFiles:html.length,checkedCssFiles:entries.length-html.length,declaredRouteCount:Array.isArray(siteMap?.pages)?siteMap.pages.length:html.length,findings:findings.slice(0,150),totalFindings:findings.length,counts,evidence:{source:'checked',renderedVisuals:'not-verified',browserInteractions:'not-verified',responsiveRendering:'not-verified',wcagConformance:'not-verified',externalAssets:'not-verified',liveIntegrations:'not-verified',searchRankings:'not-verified'},summary:findings.length?findings.length+' source-level findings require review; browser and human verification remain separate.':'No findings from included source checks; this is not proof of rendered quality or conformance.'};
}