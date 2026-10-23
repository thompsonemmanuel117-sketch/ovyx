import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditGeneratedSites } from './ovyx-webstudio-acceptance-audit.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'ovyx-acceptance-audit-'));
const sites=path.join(root,'sites'),browser=path.join(root,'browser'),reportFile=path.join(browser,'browser-report.json'),output=path.join(root,'acceptance.json');
const good=path.join(sites,'fixture-real-estate'),bad=path.join(sites,'fixture-bad-copy');
const goodHtml='<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Property advisory</title><meta name="description" content="A clear property advisory site for careful home buyers in Lagos."></head><body><main><h1>Find your next home with clarity</h1><a href="/contact/">Contact the team</a></main></body></html>';
const contactHtml='<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contact property advisory</title><meta name="description" content="Send a question through our isolated website quality assurance form."></head><body><main><h1>Send an enquiry</h1><form method="post" action="/.well-known/ovyx-qa-enquiry"><label for="visitor-name">Your name</label><input id="visitor-name" name="name" required><label for="visitor-email">Your email</label><input id="visitor-email" name="email" type="email" required><button type="submit">Send enquiry</button></form></main></body></html>';
await fs.mkdir(path.join(good,'assets'),{recursive:true});
await fs.mkdir(bad,{recursive:true});
await fs.writeFile(path.join(good,'index.html'),goodHtml);
await fs.writeFile(path.join(good,'contact.html'),contactHtml);
await fs.writeFile(path.join(good,'ovyx-live-generation.json'),JSON.stringify({
  industry:'real-estate',market:{country:'Nigeria'},liveInventorySourceConfigured:false,
  inventoryHonesty:{status:'honest-empty-state-live-feed-not-configured',passesHonestyGate:true,realListingsConfirmed:false},
  siteMap:{pages:[{title:'Home',path:'index.html',url:'/'},{title:'Contact',path:'contact.html',url:'/contact/'}]}
}));
await fs.writeFile(path.join(bad,'index.html'),'<!doctype html><html><head><title>Bad</title></head><body><h1>Lorem ipsum</h1><a href="#">Click here</a></body></html>');
await fs.writeFile(path.join(bad,'ovyx-live-generation.json'),JSON.stringify({industry:'generic',siteMap:{pages:[{title:'Home',path:'index.html',url:'/'}]}}));
const widths=[320,390,768,1024,1440];
const pages=()=>['index.html','contact.html'].flatMap((file,index)=>widths.map(width=>({page:file,route:index?'/contact/':'/',viewport:String(width),screenshot:(index?'contact':'home')+'-'+width+'.png'})));
const results=[
 {site:'fixture-real-estate',status:'browser-checked-no-obvious-blockers',viewportWidths:widths,qaLocalPosts:1,formInteractionStatus:'qa-local-post-tested',pages:pages()},
 {site:'fixture-bad-copy',status:'needs-attention',viewportWidths:widths,qaLocalPosts:0,formInteractionStatus:'no-qa-form-submission-tested',pages:widths.map(w=>({page:'index.html',viewport:String(w),screenshot:'bad-'+w+'.png'}))}
];
await fs.mkdir(path.join(browser,'fixture-real-estate'),{recursive:true});
await fs.mkdir(path.join(browser,'fixture-bad-copy'),{recursive:true});
for(const p of results[0].pages)await fs.writeFile(path.join(browser,'fixture-real-estate',p.screenshot),'test screenshot placeholder');
for(const p of results[1].pages)await fs.writeFile(path.join(browser,'fixture-bad-copy',p.screenshot),'test screenshot placeholder');
await fs.writeFile(reportFile,JSON.stringify({status:'needs-attention',results}));
try {
  const report=await auditGeneratedSites(sites,reportFile,output);
  assert.equal(report.status,'needs-attention');
  const clean=report.sites.find(s=>s.site==='fixture-real-estate');
  const flawed=report.sites.find(s=>s.site==='fixture-bad-copy');
  assert.ok(clean&&flawed);
  assert.equal(clean.status,'automated-checks-run-human-review-and-real-integration-verification-pending');
  assert.equal(clean.categories.enquiry.status,'qa-only-local-post-tested-real-delivery-unverified');
  assert.equal(clean.categories.inventory.status,'live-feed-not-configured');
  assert.equal(clean.claims.realListingsConfirmed,false);
  assert.equal(clean.claims.realEnquiryDeliveryConfirmed,false);
  assert.equal(clean.categories.visuals.status,'screenshots-captured-human-visual-review-pending');
  assert.ok(flawed.blockers>0);
  assert.ok(flawed.issues.some(i=>i.code==='DEAD_LINK'));
  assert.ok(flawed.issues.some(i=>i.code==='COPY_LOREM-IPSUM'));
  const saved=JSON.parse(await fs.readFile(output,'utf8'));
  assert.equal(saved.globalClaims.realEnquiryDeliveryConfirmed,false);
  console.log('Generated-site acceptance audit correctly distinguishes automated checks from live integrations and human visual/copy review.');
} finally {
  await fs.rm(root,{recursive:true,force:true});
}
