import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT=path.resolve(process.argv[2]||'artifacts/webstudio-generated-sites');
const BROWSER_REPORT=path.resolve(process.argv[3]||'artifacts/webstudio-evaluation-report/browser/browser-report.json');
const OUT=path.resolve(process.argv[4]||'artifacts/webstudio-evaluation-report/acceptance-report.json');
const PLACEHOLDERS=[
  ['lorem-ipsum',/\blorem ipsum\b/i],
  ['todo-fixme',/\b(?:TODO|FIXME)\b/i],
  ['placeholder-copy',/\b(?:placeholder text|content goes here|insert your text here|replace this text|your company name|your business name|your brand name|example\.com|coming soon|under construction)\b/i],
  ['bracketed-placeholder',/\[\s*(?:your|insert|replace|add)\s+(?:name|company|business|brand|text|content|image|email|phone|address)\b[^\]]{0,100}\]/i],
];
function decode(value){return String(value||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");}
function plainText(html){return decode(String(html||'').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function attr(tag,key){const k=key.replace(/[.*+?^$()|[\]\\]/g,'\\$&');const m=String(tag||'').match(new RegExp('\\b'+k+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i'));return m?String(m[1]??m[2]??m[3]??'').trim():'';}
function normalizeRoute(v){let s=String(v||'/').split(/[?#]/,1)[0]||'/';try{s=decodeURIComponent(s);}catch{}if(!s.startsWith('/'))s='/'+s;s=s.replace(/\/{2,}/g,'/');if(/\/index\.html?$/i.test(s))s=s.replace(/index\.html?$/i,'');if(!s.endsWith('/')&&!/\.[a-z0-9]{1,12}$/i.test(s))s+='/';return s.toLowerCase();}
async function walk(dir,prefix=''){let out=[];let entries=[];try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return out;}for(const e of entries){if(e.name.startsWith('.')||e.name==='node_modules')continue;const rel=prefix?prefix+'/'+e.name:e.name;if(e.isDirectory())out.push(...await walk(path.join(dir,e.name),rel));else if(e.isFile())out.push(rel);}return out;}
function localRef(from,raw,allFiles,routeMap){const r=String(raw||'').trim().split(/[?#]/,1)[0];if(!r||r.startsWith('#')||/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|mailto:|tel:)/i.test(r))return null;let value;try{value=decodeURIComponent(r);}catch{value=r;}if(value.startsWith('/')){const route=normalizeRoute(value);if(routeMap.has(route))return routeMap.get(route);value=value.replace(/^\/+/, '');}else value=path.posix.normalize(path.posix.join(path.posix.dirname(from),value));if(value==='.'||value==='..'||value.startsWith('../'))return null;const candidates=[value,value+'.html',path.posix.join(value,'index.html')];return candidates.find(c=>allFiles.has(c.toLowerCase()))||null;}
async function readJson(p,fallback={}){try{return JSON.parse(await fs.readFile(p,'utf8'));}catch{return fallback;}}
function hasFieldLabel(formHtml,field) {
  if(/\baria-label\s*=|\baria-labelledby\s*=/i.test(field))return true;
  const id=attr(field,'id');
  for(const match of formHtml.matchAll(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi)){
    const label=match[0];
    if(id&&attr(label,'for')===id)return true;
    if(label.toLowerCase().includes(field.toLowerCase()))return true;
  }
  return false;
}
export async function auditGeneratedSites(root=ROOT,browserReportPath=BROWSER_REPORT,outPath=OUT,integrationReportPath=path.resolve('artifacts/webstudio-evaluation-report/integration-report.json')){
  let rootEntries=[];try{rootEntries=await fs.readdir(root,{withFileTypes:true});}catch{}
  const sites=rootEntries.filter(e=>e.isDirectory()&&!e.name.startsWith('.'));
  const browser=await readJson(browserReportPath,{status:'not-run',evaluatedSites:0,results:[]});
  const integrations=await readJson(integrationReportPath,{listings:{status:'not-configured',realListingsConfirmed:false},enquiry:{status:'not-configured',endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false}});
  const browserByName=new Map((browser.results||[]).map(r=>[r.site,r]));
  const audited=[];
  for(const entry of sites){
    const siteDir=path.join(root,entry.name),files=await walk(siteDir);
    const htmlFiles=files.filter(f=>/\.html?$/i.test(f)),sources={};
    for(const f of files.filter(f=>/\.(?:html?|css|m?js|jsx|tsx?|svg|json|txt|md)$/i.test(f)&&f!=='ovyx-live-generation.json')){try{sources[f]=await fs.readFile(path.join(siteDir,f),'utf8');}catch{}}
    const metadata=await readJson(path.join(siteDir,'ovyx-live-generation.json'),{});
    const browserSite=browserByName.get(entry.name)||null,issues=[];
    const add=(category,severity,code,message,file='')=>issues.push({category,severity,code,message,file});
    if(!htmlFiles.length)add('structure','blocker','NO_HTML','No HTML page exists in this site artifact.');
    const allFiles=new Set(files.map(f=>f.toLowerCase()));
    const pages=metadata.siteMap?.pages||[];
    const routeMap=new Map(pages.filter(p=>p.path&&p.url).map(p=>[normalizeRoute(p.url),String(p.path).replace(/^\/+/, '')]));
    for(const htmlPath of htmlFiles){
      const html=sources[htmlPath]||'';
      if(!/<title\b[^>]*>[^<]{2,}<\/title>/i.test(html))add('copy','blocker','TITLE_MISSING','Page title is missing or empty.',htmlPath);
      if(!/\blang\s*=\s*["'][a-z]{2,3}(?:-[a-z0-9]+)?["']/i.test(html))add('accessibility','warning','LANG_MISSING','Document language metadata is missing or malformed.',htmlPath);
      if(!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html))add('responsive','blocker','VIEWPORT_MISSING','Responsive viewport metadata is missing.',htmlPath);
      if(!/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']{20,}/i.test(html)&&!/<meta\b[^>]*content\s*=\s*["'][^"']{20,}["'][^>]*name\s*=\s*["']description["']/i.test(html))add('seo','warning','DESCRIPTION_MISSING','A useful page meta description is not detected.',htmlPath);
      const copy=plainText(html);
      for(const [code,re] of PLACEHOLDERS){if(re.test(copy))add('copy','blocker','COPY_'+code.toUpperCase(),'Visible page copy contains an obvious placeholder/filler pattern ('+code+').',htmlPath);}
      const imageTags=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
      for(const tag of imageTags){
        if(!/\balt\s*=/i.test(tag))add('accessibility','blocker','IMAGE_ALT_MISSING','Image has no alt attribute.',htmlPath);
        const src=attr(tag,'src');
        if(src&&!/^(?:data:|blob:|https?:)/i.test(src)&&!localRef(htmlPath,src,allFiles,routeMap))add('assets','warning','IMAGE_REFERENCE_UNRESOLVED','Image source does not resolve to a local artifact file.',htmlPath);
      }
      for(const match of html.matchAll(/<a\b[^>]*>/gi)){
        const tag=match[0],href=attr(tag,'href');
        if(!href||href==='#'||/^javascript:/i.test(href))add('interactions','blocker','DEAD_LINK','Anchor has an empty or placeholder destination.',htmlPath);
        else if(!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)&&!localRef(htmlPath,href,allFiles,routeMap))add('navigation','warning','LOCAL_LINK_UNRESOLVED','Local link does not resolve to an HTML or artifact file: '+href.slice(0,160),htmlPath);
      }
      for(const match of html.matchAll(/<form\b[^>]*>/gi)){
        const tag=match[0],action=attr(tag,'action'),method=(attr(tag,'method')||'get').toLowerCase();
        if(!action)add('enquiry','warning','FORM_DESTINATION_MISSING','Form has no declared action URL; check for JavaScript-only behavior.',htmlPath);
        else if(action==='/\.well-known/ovyx-qa-enquiry')add('enquiry','info','QA_ENDPOINT_ONLY','Form targets the isolated QA receiver, not a real enquiry delivery service.',htmlPath);
        else if(/^(?:javascript:|#)/i.test(action))add('enquiry','blocker','FORM_DESTINATION_INVALID','Form uses a placeholder or script URL as its destination.',htmlPath);
        if(!['get','post'].includes(method))add('enquiry','blocker','FORM_METHOD_INVALID','Form uses an unsupported method.',htmlPath);
        const end=html.indexOf('</form',match.index),formHtml=html.slice(match.index,end<0?undefined:end);
        for(const fmatch of formHtml.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)){
          const field=fmatch[0],type=attr(field,'type').toLowerCase();
          if(['hidden','submit','button','reset','image'].includes(type))continue;
          if(!hasFieldLabel(formHtml,field))add('accessibility','blocker','FORM_LABEL_MISSING','Form field is missing a detectable accessible label.',htmlPath);
        }
      }
    }
    if(!browserSite)add('runtime','blocker','BROWSER_EVIDENCE_MISSING','No runtime browser report exists for this generated site.');
    else if(browserSite.status!=='browser-checked-no-obvious-blockers')add('runtime','blocker','BROWSER_RUNTIME_FINDINGS','Browser report status is '+browserSite.status+'.');
    if(browserSite&&!browserSite.qaLocalPosts)add('enquiry','warning','QA_ENQUIRY_NOT_EXERCISED','No QA-only form POST was exercised in the browser.');
    if(metadata.industry==='real-estate'&&!metadata.liveInventorySourceConfigured&&metadata.inventoryHonesty?.passesHonestyGate!==true)add('inventory','blocker','INVENTORY_PROVENANCE_UNSAFE','Real-estate copy does not clearly distinguish sample listings from unconfigured live inventory.');
    const visualScreenshots=(browserSite?.pages||[]).filter(p=>p.screenshot).length;
    const imageDir=path.join(path.dirname(browserReportPath),entry.name);
    const actualScreenshots=(await walk(imageDir)).filter(f=>f.endsWith('.png')).length;
    const categories={
      copy:{status:issues.some(i=>i.category==='copy'&&i.severity==='blocker')?'needs-attention':'heuristic-checked-human-proofread-pending',humanEditorialReviewCompleted:false},
      visuals:{status:visualScreenshots>=Math.min(htmlFiles.length,12)*5&&actualScreenshots>=visualScreenshots?'screenshots-captured-human-visual-review-pending':'screenshot-coverage-incomplete',screenshotsReported:visualScreenshots,screenshotsOnDisk:actualScreenshots,humanVisualReviewCompleted:false},
      interactions:{status:issues.some(i=>i.category==='interactions'&&i.severity==='blocker')||Number(browserSite?.noOpButtons||0)>0?'needs-attention':Number(browserSite?.buttonsTested||0)>0?'browser-click-tested-no-inert-standalone-buttons-detected':'no-standalone-buttons-present-or-click-tests-unavailable',buttonsTested:Number(browserSite?.buttonsTested||0),noOpButtons:Number(browserSite?.noOpButtons||0)},
      enquiry:{status:integrations.enquiry?.endpointAcceptedTestPayload?'endpoint-accepted-test-payload-delivery-unverified':browserSite?.formInteractionStatus==='qa-local-post-tested'?'qa-only-local-post-tested-real-destination-'+(integrations.enquiry?.status||'not-configured'):(integrations.enquiry?.status||'not-configured'),qaOnlyFormStatus:browserSite?.formInteractionStatus||'not-tested',realEnquiryDeliveryConfirmed:false},
      inventory:{status:metadata.industry!=='real-estate'?'not-applicable':integrations.listings?.realListingsConfirmed?'authoritative-feed-active-records-and-site-wiring-verified':integrations.listings?.endpointConfigured?'source-configured-but-listings-or-site-wiring-not-confirmed':'live-feed-not-configured',sourceStatus:integrations.listings?.status||'not-configured',realListingsConfirmed:integrations.listings?.realListingsConfirmed===true},
      responsive:{status:browserSite&&[320,390,768,1024,1440].every(v=>browserSite.viewportWidths?.includes(v))?'five-viewports-checked':'responsive-evidence-incomplete'},
    };
    const blockers=issues.filter(i=>i.severity==='blocker').length,warnings=issues.filter(i=>i.severity==='warning').length;
    audited.push({
      site:entry.name,industry:metadata.industry||null,country:metadata.market?.country||null,
      status:blockers?'needs-attention':'automated-checks-run-human-review-and-real-integration-verification-pending',
      pageCount:htmlFiles.length,blockers,warnings,issues,categories,
      claims:{realListingsConfirmed:false,realEnquiryDeliveryConfirmed:false,humanVisualReviewCompleted:false,humanEditorialReviewCompleted:false},
    });
  }
  const report={
    schemaVersion:1,generatedAt:new Date().toISOString(),
    status:!audited.length?'not-run-no-generated-sites':audited.some(s=>s.status==='needs-attention')?'needs-attention':'automated-checks-run-human-review-and-real-integration-verification-pending',
    sitesFound:sites.length,sites:audited,
    globalClaims:{realListingsConfirmed:audited.length>0&&audited.filter(s=>s.industry==='real-estate').length>0&&audited.filter(s=>s.industry==='real-estate').every(s=>s.categories.inventory.realListingsConfirmed===true),realEnquiryDeliveryConfirmed:false,humanVisualReviewCompleted:false,humanEditorialReviewCompleted:false},
    note:'Automated heuristics cannot certify copy excellence, visual originality, actual listing authenticity or external enquiry delivery. Human review and explicit real-service tests remain separate evidence gates.',
  };
  await fs.mkdir(path.dirname(outPath),{recursive:true});
  await fs.writeFile(outPath,JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  auditGeneratedSites().then(report=>{
    console.log(JSON.stringify({status:report.status,sitesFound:report.sitesFound,report:OUT},null,2));
    if(report.status==='not-run-no-generated-sites'||report.sites.some(s=>s.status==='needs-attention'))process.exitCode=1;
  }).catch(error=>{console.error('Generated-site acceptance audit failed:',error);process.exitCode=1;});
}
