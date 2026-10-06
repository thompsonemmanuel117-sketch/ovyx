import { authenticateRequest } from '../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { getGitHubToken } from '../../_lib/github.js';
import { initializeQuotaProfile } from '../../_lib/token-quota.js';
import { jsonResponse, requestId } from '../_lib/http.js';

function userId(user){return String(user?.sub||user?.uid||'').trim();}
export async function onRequestPost(context){
  const id=requestId(context.request);
  try{
    if(!String(context.env?.FIREBASE_PROJECT_ID||'').trim()){
      throw Object.assign(new Error('OVYX Firebase server authentication is not configured (FIREBASE_PROJECT_ID).'),{status:503,code:'FIREBASE_SERVER_AUTH_CONFIG_MISSING'});
    }
    if(!String(context.env?.FIREBASE_SERVICE_ACCOUNT_JSON||context.env?.FIREBASE_SERVICE_ACCOUNT||'').trim()){
      throw Object.assign(new Error('OVYX Firebase server database access is not configured (FIREBASE_SERVICE_ACCOUNT_JSON).'),{status:503,code:'FIREBASE_SERVER_DATABASE_CONFIG_MISSING'});
    }
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
    await setFirestoreDocument(context.env,'users',uid,{workspaceActive:true,workspaceActivatedAt:activatedAt,workspaceActivationVersion:1},{merge:true});
    await initializeQuotaProfile(context.env, uid, String(existing.planTier || existing.tier || existing.plan || 'free').toLowerCase());    return jsonResponse({ok:true,scope:'user_workspace',workspaceActive:true,activatedAt,integrations:{
      codeGateway:{enabled:true,basePath:'/api',aiGateway:'/api/ai/gateway',assistant:'/api/ai/assistant'},
      github:{provider:'github-app-installation',connected:githubReady},
      mobileBuild:{provider:'expo-eas',configured:mobileBuildReady,status:mobileBuildReady?'READY':'NOT_CONFIGURED'}
    },planTier:String(existing.planTier||'free').toLowerCase()},200,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Workspace activation failed.',code:error?.code||'WORKSPACE_ACTIVATION_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
export async function onRequest(context){
  if(context.request.method==='POST')return onRequestPost(context);
  return jsonResponse({ok:false,error:'POST is required.',code:'METHOD_NOT_ALLOWED'},405);
}
