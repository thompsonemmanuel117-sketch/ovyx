const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function getBearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  if (!value.startsWith('Bearer ')) return '';
  return value.slice(7).trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeProjectName(value) {
  const name = String(value || '').trim();

  if (!name || name.length > 63) {
    throw new Error('Invalid Cloudflare Pages project name.');
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new Error('Invalid Cloudflare Pages project name.');
  }

  return name;
}

async function verifyFirebaseIdentity(idToken, env) {
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required.'
    };
  }

  if (!env.FIREBASE_WEB_API_KEY) {
    console.error('[OVYX deploy] FIREBASE_WEB_API_KEY is not configured.');
    return {
      ok: false,
      status: 500,
      error: 'Authentication service is not configured.'
    };
  }

  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      env.FIREBASE_WEB_API_KEY
    )}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idToken
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !Array.isArray(data.users) || !data.users[0]) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid or expired authentication session.'
      };
    }

    const firebaseUser = data.users[0];

    return {
      ok: true,
      user: {
        uid: String(firebaseUser.localId || ''),
        email: normalizeEmail(firebaseUser.email),
        emailVerified: firebaseUser.emailVerified === true
      }
    };
  } catch (error) {
    console.error('[OVYX deploy] Firebase identity verification failed:', {
      message: error?.message || 'unknown'
    });

    return {
      ok: false,
      status: 503,
      error: 'Authentication service is temporarily unavailable.'
    };
  }
}

function hasCloudflareDeployCapability(user, env) {
  /*
   * Root OVYX support account is the server-authoritative system override.
   */
  if (user.email === ROOT_EMAIL && user.emailVerified) {
    return true;
  }

  /*
   * Normal users must receive this capability from the server-side
   * entitlement system. This endpoint intentionally does not trust
   * plan/tier values supplied by the browser.
   *
   * FIREBASE_DEPLOY_ALLOWLIST is optional and intended only for
   * controlled deployment environments where the backend explicitly
   * provisions deployment-capable users.
   */
  const allowlist = String(env.FIREBASE_DEPLOY_ALLOWLIST || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return allowlist.includes(user.email);
}

async function cloudflareRequest(path, env, init = {}, authToken = env.CLOUDFLARE_API_TOKEN) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare deployment credentials are not configured.');
  }

  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Cloudflare account configuration is missing.');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...(init.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success !== true) {
    const providerMessage =
      Array.isArray(data.errors) && data.errors[0]?.message
        ? String(data.errors[0].message)
        : 'Cloudflare API request failed.';

    const error = new Error(providerMessage);
    error.status = response.status;
    error.providerErrors = data.errors || [];
    throw error;
  }

  return data;
}

function getDeploymentResult(result) {
  const deployment = result || {};

  return {
    deploymentId: deployment.id || null,
    status: deployment.latest_stage?.name || deployment.status || 'queued',
    environment: deployment.environment || 'production',
    url:
      Array.isArray(deployment.aliases) && deployment.aliases.length
        ? deployment.aliases[0]
        : null,
    createdAt: deployment.created_on || null,
    poll: deployment.id
      ? {
          enabled: true,
          method: 'GET',
          endpoint: '/api/deploy/status',
          deploymentId: deployment.id
        }
      : {
          enabled: false
        }
  };
}


async function ovyxSha256(bytes) { const d = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function ovyxB64(bytes){ let s=''; for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(s); }
function ovyxSlug(v,f='site'){ const x=String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36); return x||f; }
function ovyxMime(p){ p=String(p).toLowerCase(); if(p.endsWith('.html'))return'text/html; charset=utf-8'; if(p.endsWith('.css'))return'text/css; charset=utf-8'; if(p.endsWith('.js')||p.endsWith('.mjs'))return'text/javascript; charset=utf-8'; if(p.endsWith('.json'))return'application/json; charset=utf-8'; if(p.endsWith('.svg'))return'image/svg+xml'; if(p.endsWith('.png'))return'image/png'; if(p.endsWith('.jpg')||p.endsWith('.jpeg'))return'image/jpeg'; if(p.endsWith('.webp'))return'image/webp'; if(p.endsWith('.gif'))return'image/gif'; if(p.endsWith('.woff2'))return'font/woff2'; return'application/octet-stream'; }
function ovyxSafePath(v){ v=String(v||'').replace(/\\\\/g,'/').replace(/^\\.\\//,'').trim(); if(!v||v.length>500||v.startsWith('/')||v.includes('..')||/[\\0\\r\\n]/.test(v))throw new Error('Invalid project file path.'); if(v==='functions'||v.startsWith('functions/'))throw new Error('Static Publish does not deploy functions/.'); return v; }
async function ovyxPagesName(user,pid,name,prefix){ const h=await ovyxSha256(new TextEncoder().encode(user.uid+':'+pid)); return ovyxSlug(ovyxSlug(prefix||'ovyx','ovyx')+'-'+h.slice(0,10)+'-'+ovyxSlug(name,'site')); }
async function ovyxEnsurePagesProject(env,name){ try{ const p=(await cloudflareRequest('/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/pages/projects/'+encodeURIComponent(name),env,{method:'GET'})).result||{}; if(p.source?.type)throw Object.assign(new Error('Cloudflare Pages project is Git-integrated. OVYX Publish requires Direct Upload.'),{status:409}); return p; }catch(e){ if(e.status!==404)throw e; return (await cloudflareRequest('/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/pages/projects',env,{method:'POST',body:JSON.stringify({name,production_branch:'main'})})).result||{}; } }
async function ovyxUploadToken(env,name){ const d=await cloudflareRequest('/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/pages/projects/'+encodeURIComponent(name)+'/upload-token',env,{method:'GET'}); if(!d.result?.jwt)throw new Error('Cloudflare upload token was not returned.'); return d.result.jwt; }
async function ovyxPrepareFiles(raw){ if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Deployment files are required.'); const es=Object.entries(raw); if(!es.length)throw new Error('The project has no files to deploy.'); if(es.length>MAX_FILES)throw new Error('Too many project files.'); const out={}; let total=0; for(const [rp,rf0] of es){ const p=ovyxSafePath(rp),rf=rf0&&typeof rf0==='object'?rf0:{content:rf0}; let b; if(String(rf.encoding||'').toLowerCase()==='base64'){const x=atob(String(rf.content||''));b=Uint8Array.from(x,c=>c.charCodeAt(0));}else b=new TextEncoder().encode(String(rf.content??'')); if(b.byteLength>MAX_FILE_BYTES)throw new Error(p+' exceeds the 25 MiB Pages file limit.'); total+=b.byteLength; if(total>MAX_BODY_BYTES)throw new Error('The deployment payload exceeds 20 MiB.'); out[p]={hash:await ovyxSha256(b),value:ovyxB64(b),contentType:String(rf.contentType||ovyxMime(p))}; } return out; }
async function ovyxUploadMissing(env,jwt,files){ const all=Object.values(files),checked=await cloudflareRequest('/pages/assets/check-missing',env,{method:'POST',body:JSON.stringify({hashes:all.map(x=>x.hash)})},jwt),missing=new Set(Array.isArray(checked.result)?checked.result.map(String):[]); let batch=[],size=0; const flush=async()=>{if(!batch.length)return;await cloudflareRequest('/pages/assets/upload',env,{method:'POST',body:JSON.stringify(batch)},jwt);batch=[];size=0;}; for(const f of all.filter(x=>missing.has(x.hash))){const item={key:f.hash,value:f.value,base64:true,metadata:{contentType:f.contentType}},n=JSON.stringify(item).length;if(batch.length>=25||(size+n>3500000&&batch.length))await flush();batch.push(item);size+=n;} await flush(); return {missing:missing.size,total:all.length}; }
function ovyxSummary(d,name,action){const x=d||{},a=Array.isArray(x.aliases)?x.aliases:[],s=Array.isArray(x.stages)?x.stages:[],last=s.find(v=>v.status==='active')||s.at(-1)||null;return{deploymentId:x.id||null,pagesProjectName:name,action,environment:x.environment||(action==='publish'?'production':'preview'),status:last?.status||x.status||'queued',stage:last?.name||null,url:a[0]||x.url||null,aliases:a,createdAt:x.created_on||null,modifiedAt:x.modified_on||null};}


export async function onRequestPost(context) {
  const requestId=crypto.randomUUID(),{request,env}=context;
  try{
    const n=Number(request.headers.get('Content-Length')||0);
    if(Number.isFinite(n)&&n>MAX_BODY_BYTES)return json({success:false,authoritative:true,error:'Deployment request is too large.',requestId},413);
    const identity=await verifyFirebaseIdentity(getBearerToken(request),env);
    if(!identity.ok)return json({success:false,authoritative:true,error:identity.error,requestId},identity.status);
    const user=identity.user;
    if(!user.uid||!user.email)return json({success:false,authoritative:true,error:'Authenticated user identity is incomplete.',requestId},401);
    if(!user.emailVerified)return json({success:false,authoritative:true,error:'Verify your email before deploying.',requestId},403);
    if(!hasCloudflareDeployCapability(user,env))return json({success:false,authoritative:true,error:'Your OVYX account is not authorized to deploy to Cloudflare.',requestId},403);
    let body; try{body=await request.json();}catch{return json({success:false,authoritative:true,error:'Invalid JSON deployment request.',requestId},400);}
    const action=body?.action==='publish'?'publish':'deploy',projectId=String(body?.projectId||'').trim();
    if(!projectId||projectId.length>160)return json({success:false,authoritative:true,error:'A valid OVYX projectId is required.',requestId},400);
    const pagesProjectName=await ovyxPagesName(user,projectId,body?.projectName||'site',env.CLOUDFLARE_PAGES_PROJECT_PREFIX);
    const files=await ovyxPrepareFiles(body?.files);
    await ovyxEnsurePagesProject(env,pagesProjectName);
    const jwt=await ovyxUploadToken(env,pagesProjectName);
    const uploaded=await ovyxUploadMissing(env,jwt,files);
    const manifest={}; for(const [path,file] of Object.entries(files))manifest[path]=file.hash;
    const form=new FormData(); form.append('manifest',JSON.stringify(manifest)); form.append('commit_message','OVYX '+action+': '+String(body?.projectName||projectId).slice(0,80)); if(action==='deploy')form.append('branch','ovyx-preview-'+requestId.slice(0,12));
    const result=await cloudflareRequest('/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/pages/projects/'+encodeURIComponent(pagesProjectName)+'/deployments',env,{method:'POST',body:form});
    return json({success:true,authoritative:true,requestId,uploaded,deployment:ovyxSummary(result.result,pagesProjectName,action)});
  }catch(error){
    const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:502;
    console.error(JSON.stringify({event:'ovyx_pages_direct_upload_failed',requestId,status,message:error?.message||'Unknown deployment error',providerErrors:error?.providerErrors||[]}));
    return json({success:false,authoritative:true,requestId,error:status>=500?'Cloudflare deployment service is temporarily unavailable.':error?.message||'Cloudflare deployment failed.'},status);
  }
}
