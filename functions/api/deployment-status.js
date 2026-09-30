import { resolveEntitlements } from './entitlements.js';
import { getFirestoreData } from '../../_lib/firebase-admin.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function verifyFirebaseIdentity(idToken, env) {
  if (!idToken) return { ok:false, status:401, error:'Authentication required.' };
  if (!env.FIREBASE_WEB_API_KEY) return { ok:false, status:500, error:'Authentication service is not configured.' };
  try {
    const response = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
        encodeURIComponent(env.FIREBASE_WEB_API_KEY),
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({idToken})
      }
    );
    const data = await response.json().catch(()=>({}));
    const firebaseUser = Array.isArray(data.users) ? data.users[0] : null;
    if (!response.ok || !firebaseUser) return { ok:false, status:401, error:'Invalid or expired authentication session.' };
    return {
      ok:true,
      user:{
        uid:String(firebaseUser.localId||''),
        email:String(firebaseUser.email||'').trim().toLowerCase(),
        emailVerified:firebaseUser.emailVerified===true
      }
    };
  } catch {
    return { ok:false, status:503, error:'Authentication service is temporarily unavailable.' };
  }
}

async function cloudflareGet(path, env) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw Object.assign(new Error('Cloudflare deployment configuration is missing.'), { status:500 });
  }
  const response = await fetch('https://api.cloudflare.com/client/v4'+path, {
    headers:{
      Accept:'application/json',
      Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN
    }
  });
  const data=await response.json().catch(()=>({}));
  if (!response.ok || data.success!==true) {
    const message=Array.isArray(data.errors)&&data.errors[0]?.message
      ? String(data.errors[0].message)
      : 'Cloudflare API request failed.';
    throw Object.assign(new Error(message), {status:response.status});
  }
  return data.result;
}

function slug(value, fallback='site') {
  const out=String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36);
  return out || fallback;
}

async function pagesProjectName(user, projectId, projectName, prefix) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(user.uid+':'+projectId)
  );
  const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return slug((prefix||'ovyx')+'-'+hash.slice(0,10)+'-'+slug(projectName,'site'));
}

export async function onRequestGet(context) {
  const requestId=crypto.randomUUID();
  const {request,env}=context;
  try {
    const identity=await verifyFirebaseIdentity(bearer(request),env);
    if(!identity.ok)return json({success:false,authoritative:true,error:identity.error,requestId},identity.status);
    const user=identity.user;
    if(!user.emailVerified)return json({success:false,authoritative:true,error:'Verify your email before checking deployment status.',requestId},403);

    const entitlements=await resolveEntitlements(env,user);
    if(entitlements?.capabilities?.cloudflareDeploy!==true){
      return json({success:false,authoritative:true,error:'Your OVYX account is not authorized to view deployment status.',requestId},403);
    }

    const qs=new URL(request.url).searchParams;
    const projectId=String(qs.get('projectId')||'').trim();
    const deploymentId=String(qs.get('deploymentId')||'').trim();
    const projectName=String(qs.get('projectName')||'').trim();

    if(!projectId||!deploymentId){
      return json({success:false,authoritative:true,error:'projectId and deploymentId are required.',requestId},400);
    }

    const safeProjectName=await pagesProjectName(
      user,
      projectId,
      projectName||'site',
      env.CLOUDFLARE_PAGES_PROJECT_PREFIX
    );

    const deployment=await cloudflareGet(
      '/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+
      '/pages/projects/'+encodeURIComponent(safeProjectName)+
      '/deployments/'+encodeURIComponent(deploymentId),
      env
    );

    const aliases=Array.isArray(deployment.aliases)?deployment.aliases:[];
    const stages=Array.isArray(deployment.stages)?deployment.stages:[];
    const active=stages.find(x=>x.status==='active')||stages.at(-1)||null;

    return json({
      success:true,
      authoritative:true,
      requestId,
      deployment:{
        deploymentId:deployment.id||deploymentId,
        pagesProjectName:safeProjectName,
        status:active?.status||deployment.status||'queued',
        stage:active?.name||null,
        environment:deployment.environment||'production',
        url:aliases[0]||deployment.url||null,
        aliases,
        createdAt:deployment.created_on||null,
        modifiedAt:deployment.modified_on||null,
        stages
      }
    });
  } catch(error) {
    const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:502;
    console.error(JSON.stringify({
      event:'ovyx_deployment_status_failed',
      requestId,
      status,
      message:error?.message||'Unknown deployment status error'
    }));
    return json({
      success:false,
      authoritative:true,
      requestId,
      error:status>=500?'Cloudflare deployment status service is temporarily unavailable.':error?.message||'Unable to read deployment status.'
    },status);
  }
}
