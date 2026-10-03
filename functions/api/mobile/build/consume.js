import { authenticateRequest } from '../../../_lib/firebase.js';
import { getFirestoreDocument, getFirestoreData, setFirestoreDocumentIfCurrent } from '../../../_lib/firebase-admin.js';
import { jsonResponse } from '../../_lib/http.js';

export async function onRequestPost(context){
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const uid=String(user?.uid||user?.sub||'').trim();if(!uid)throw Object.assign(new Error('Authentication required.'),{status:401});
    const body=await context.request.json().catch(()=>({}));
    const jobId=String(body?.jobId||'').trim(),platform=String(body?.platform||'android').toLowerCase();
    if(!jobId||!['android','ios'].includes(platform))throw Object.assign(new Error('jobId and platform are required.'),{status:400});
    const jobDoc=await getFirestoreDocument(context.env,'mobile_builds',jobId);if(!jobDoc)throw Object.assign(new Error('Build job not found.'),{status:404});
    const job=await getFirestoreData(context.env,'mobile_builds',jobId)||{};
    if(String(job.userId||'')!==uid)throw Object.assign(new Error('You do not own this build.'),{status:403});
    const artifact=job?.artifacts?.[platform];const url=String(artifact?.url||artifact?.downloadUrl||'').trim();if(!url)throw Object.assign(new Error('No real artifact is available for this platform.'),{status:409});
    for(let attempt=0;attempt<6;attempt++){
      const profileDoc=await getFirestoreDocument(context.env,'users',uid);const profile=profileDoc?(await getFirestoreData(context.env,'users',uid)||{}):{};
      const remaining=profile.mobile_builds_remaining===undefined?5:Math.max(0,Number(profile.mobile_builds_remaining)||0);
      if(remaining<=0)throw Object.assign(new Error('No binary downloads remain. Buy more App Builds to continue.'),{status:402,code:'MOBILE_BUILD_QUOTA_EXHAUSTED'});
      const next=remaining-1;
      const result=await setFirestoreDocumentIfCurrent(context.env,'users',uid,{mobile_builds_remaining:next,mobile_builds_last_consumed_at:new Date().toISOString()},profileDoc?.updateTime).catch(e=>e);
      if(result?.status===409||result?.code==='FIRESTORE_PRECONDITION_FAILED')continue;
      if(result instanceof Error)throw result;
      return jsonResponse({ok:true,url,platform,remaining:next,total:5},200,{'Cache-Control':'no-store'});
    }
    throw Object.assign(new Error('Build quota update conflicted. Try again.'),{status:503});
  }catch(error){return jsonResponse({ok:false,error:error?.message||'Download quota check failed.',code:error?.code||'MOBILE_DOWNLOAD_FAILED'},error?.status||500,{'Cache-Control':'no-store'});}
}
export async function onRequest(context){if(context.request.method==='POST')return onRequestPost(context);return jsonResponse({ok:false,error:'POST is required.'},405);}