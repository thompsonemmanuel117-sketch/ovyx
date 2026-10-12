import { authenticateRequest } from '../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { getGitHubToken } from '../../_lib/github.js';
import { initializeQuotaProfile } from '../../_lib/token-quota.js';
import { jsonResponse, requestId } from '../_lib/http.js';

function userId(user){return String(user?.sub||user?.uid||'').trim();}

function boundedText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

// Keep the authenticated workspace profile up to date. The caller stores this
// with merge:true so subscription, quota and billing fields remain untouched.
export function buildWorkspaceActivationRecord(user, existing = {}, activatedAt) {
  const uid = boundedText(user?.uid || user?.sub, 180);
  const email = boundedText(user?.email || existing?.email, 320).toLowerCase();
  const displayName = boundedText(user?.displayName || user?.name || existing?.displayName, 160);
  const photoUrl = boundedText(user?.photoUrl || user?.picture || existing?.photoUrl, 2048);
  return {
    uid: uid || null,
    email: email || null,
    displayName: displayName || null,
    photoUrl: photoUrl || null,
    workspaceActive: true,
    workspaceActivatedAt: String(activatedAt || new Date().toISOString()),
    workspaceActivationVersion: 2,
  };
}

// Report the presence of encryption configuration without returning its value.
export function buildUniversalConnectionsStatus(env = {}) {
  const configured = Boolean(String(env?.OVYX_CONNECTION_ENCRYPTION_KEY || '').trim());
  return { enabled: true, configured, status: configured ? 'CONFIGURED' : 'NOT_CONFIGURED' };
}
export async function onRequestPost(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const uid=userId(user);
    if(!uid)return jsonResponse({ok:false,error:'Authentication required.',code:'AUTH_REQUIRED'},401,{'X-OVYX-Request-ID':id});
    let githubReady=false;
    if(context.env.GITHUB_APP_ID&&context.env.GITHUB_APP_INSTALLATION_ID&&context.env.GITHUB_APP_PRIVATE_KEY){
      try{await getGitHubToken(context.env);githubReady=true;}catch{githubReady=false;}
    }
    const mobileBuildReady=Boolean(String(context.env.EXPO_TOKEN||'').trim()&&String(context.env.EXPO_PROJECT_ID||'').trim()&&String(context.env.OVYX_MOBILE_PAYLOAD_SECRET||'').trim());
    const activatedAt=new Date().toISOString();
    const existing=(await getFirestoreData(context.env,'users',uid))||{};
    const activationRecord = buildWorkspaceActivationRecord(user, existing, activatedAt);
    await setFirestoreDocument(context.env,'users',uid,activationRecord,{merge:true});
    let quotaProfileInitialized = true;
    try {
      await initializeQuotaProfile(
        context.env,
        uid,
        String(existing.planTier || existing.tier || existing.plan || 'free').toLowerCase()
      );
    } catch (quotaError) {
      // Authentication and the workspace profile have already succeeded. A
      // transient quota write must not make the sign-in UI act as if login
      // failed; quota initialization can be retried on the next AI request.
      quotaProfileInitialized = false;
      console.error(
        '[OVYX WORKSPACE ' + id + '] quota initialization deferred:',
        String(quotaError?.code || quotaError?.message || 'unknown error').slice(0, 240)
      );
    }
    return jsonResponse({ok:true,scope:'user_workspace',workspaceActive:true,activatedAt,profile:{uid:activationRecord.uid,email:activationRecord.email,displayName:activationRecord.displayName,photoUrl:activationRecord.photoUrl},integrations:{
      codeGateway:{enabled:true,basePath:'/api',aiGateway:'/api/ai/gateway',assistant:'/api/ai/assistant'},
      github:{provider:'github-app-installation',connected:githubReady},
      mobileBuild:{provider:'expo-eas',configured:mobileBuildReady,status:mobileBuildReady?'READY':'NOT_CONFIGURED'},
      universalConnections:buildUniversalConnectionsStatus(context.env)
    },planTier:String(existing.planTier||'free').toLowerCase(),quotaProfile:{initialized:quotaProfileInitialized,status:quotaProfileInitialized?'READY':'DEFERRED'}},200,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Workspace activation failed.',code:error?.code||'WORKSPACE_ACTIVATION_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
export async function onRequest(context){
  if(context.request.method==='POST')return onRequestPost(context);
  return jsonResponse({ok:false,error:'POST is required.',code:'METHOD_NOT_ALLOWED'},405);
}
