import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { getGitHubToken } from '../../_lib/github.js';
import { initializeQuotaProfile } from '../../_lib/token-quota.js';
import { jsonResponse, requestId } from '../_lib/http.js';

function userId(user){return String(user?.uid||user?.sub||'').trim();}
export async function onRequestPost(context){
  const id=requestId(context.request);
  try{
    const identity=await verifyFirebaseIdToken(context.request,context.env);
    if(!identity.ok)return identity.response;
    const user=identity.user;
    const uid=userId(user);
    if(!uid)return jsonResponse({ok:false,error:'AUTH_REQUIRED',message:'Authentication required.',code:'AUTH_REQUIRED'},401,{'X-OVYX-Request-ID':id});

    let githubReady=false;
    if(context.env.GITHUB_APP_ID&&context.env.GITHUB_APP_INSTALLATION_ID&&context.env.GITHUB_APP_PRIVATE_KEY){
      try{await getGitHubToken(context.env);githubReady=true;}catch(_){githubReady=false;}
    }

    const mobileBuildReady=Boolean(
      String(context.env.EXPO_TOKEN||'').trim()&&
      String(context.env.EXPO_PROJECT_ID||'').trim()&&
      String(context.env.OVYX_MOBILE_PAYLOAD_SECRET||'').trim()
    );

    const activatedAt=new Date().toISOString();
    const existing=(await getFirestoreData(context.env,'users',uid))||{};
    await setFirestoreDocument(
      context.env,
      'users',
      uid,
      {
        email:String(user.email||existing.email||'').trim().toLowerCase()||null,
        displayName:String(user.displayName||existing.displayName||'').trim()||null,
        photoUrl:String(user.photoUrl||existing.photoUrl||'').trim()||null,
        workspaceActive:true,
        workspaceActivatedAt:activatedAt,
        workspaceActivationVersion:2
      },
      {merge:true}
    );

    let quotaReady=true;
    let quotaError=null;
    try{
      await initializeQuotaProfile(
        context.env,
        uid,
        String(existing.planTier||existing.tier||existing.plan||'free').toLowerCase()
      );
    }catch(error){
      quotaReady=false;
      quotaError=String(error?.code||error?.message||'QUOTA_INITIALIZATION_FAILED').slice(0,300);
      console.error('[OVYX WORKSPACE QUOTA INIT]',quotaError);
    }

    return jsonResponse({
      ok:true,
      scope:'user_workspace',
      workspaceActive:true,
      activatedAt,
      profile:{
        uid,
        email:String(user.email||existing.email||'').trim().toLowerCase()||null,
        displayName:String(user.displayName||existing.displayName||'').trim()||null
      },
      integrations:{
        codeGateway:{enabled:true,basePath:'/api',aiGateway:'/api/ai/gateway',assistant:'/api/ai/assistant'},
        github:{provider:'github-app-installation',connected:githubReady},
        mobileBuild:{provider:'expo-eas',configured:mobileBuildReady,status:mobileBuildReady?'READY':'NOT_CONFIGURED'},
        universalConnections:{enabled:true,route:'/api/settings/connections',serverAuthoritative:true}
      },
      quota:{ready:quotaReady,error:quotaError},
      planTier:String(existing.planTier||existing.tier||existing.plan||'free').toLowerCase()
    },200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
  }catch(error){
    return jsonResponse({
      ok:false,
      error:error?.message||'Workspace activation failed.',
      code:error?.code||'WORKSPACE_ACTIVATION_FAILED'
    },error?.status||500,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
  }
}
export async function onRequest(context){
  if(context.request.method==='POST')return onRequestPost(context);
  return jsonResponse({ok:false,error:'POST is required.',code:'METHOD_NOT_ALLOWED'},405);
}
