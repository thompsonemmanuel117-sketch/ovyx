import { authenticateRequest } from '../../../_lib/firebase.js';
import { getFirestoreDocument, getFirestoreData } from '../../../_lib/firebase-admin.js';
import { jsonResponse } from '../../_lib/http.js';

export async function onRequestGet(context){
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const uid=String(user?.uid||user?.sub||'').trim();if(!uid)throw Object.assign(new Error('Authentication required.'),{status:401});
    const doc=await getFirestoreDocument(context.env,'users',uid);const profile=doc?(await getFirestoreData(context.env,'users',uid)||{}):{};
    const remaining=profile.mobile_builds_remaining===undefined?5:Math.max(0,Number(profile.mobile_builds_remaining)||0);
    return jsonResponse({ok:true,remaining,total:5,tokens:Math.max(0,Number(profile.current_monthly_tokens)||0),planTier:String(profile.planTier||'free').toLowerCase()},200,{'Cache-Control':'no-store'});
  }catch(error){return jsonResponse({ok:false,error:error?.message||'Build quota unavailable.'},error?.status||500,{'Cache-Control':'no-store'});}
}
export async function onRequest(context){if(context.request.method==='GET')return onRequestGet(context);return jsonResponse({ok:false,error:'GET is required.'},405);}