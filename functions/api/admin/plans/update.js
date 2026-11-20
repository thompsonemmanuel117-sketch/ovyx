import { authenticateRequest } from '../../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../../_lib/firebase-admin.js';
import { ROOT_EMAIL } from '../../../_lib/brain/registry.js';
import { readJson, jsonResponse, requestId } from '../../_lib/http.js';
import { recordAdminAuditEvent } from '../../../_lib/admin-audit.js';

const ALLOWED_TIERS = new Set(['free', 'pro', 'max']);
const AVAILABLE_FEATURES = ['webStudio','advancedWebStudio','appStudio','aiGeneration','github','cloudflareDeploy','teamWorkspace','templates'];

const DEFAULTS = {
  pricing: { pro: { ngn: 33500, usd: 20 }, max: { ngn: 209375, usd: 120 } },
  tokenQuotas: { free: 50000, pro: 500000, max: 5000000 },
  dailyPromptQuotas: { free: 4, pro: 20, max: 100 },
  planFeatures: { pro: [], max: [] },
  accessRules: []
};

function cleanNumber(value,label){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0) throw Object.assign(new Error(`${label} must be a positive number.`),{status:400,code:'INVALID_PLAN_VALUE'});
  return n;
}
function isAdmin(user){
  if(!user)return false;
  // Only the authenticated canonical owner email may change platform-wide plans and gates.
  // Firebase/profile role labels are not substitutes for the owner identity.
  return String(user.email||'').trim().toLowerCase()===ROOT_EMAIL.toLowerCase();
}
async function readConfig(env){
  const current=(await getFirestoreData(env,'system','config'))||{};
  return {...DEFAULTS,...current,
    pricing:{...DEFAULTS.pricing,...(current.pricing||{})},
    tokenQuotas:{...DEFAULTS.tokenQuotas,...(current.tokenQuotas||{})},
    dailyPromptQuotas:{...DEFAULTS.dailyPromptQuotas,...(current.dailyPromptQuotas||{})},
    planFeatures:{pro:AVAILABLE_FEATURES,max:AVAILABLE_FEATURES},
    accessRules:[],
    gating:{}
  };
}
export async function onRequest(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    if(!isAdmin(user))return jsonResponse({ok:false,error:'Administrator authorization is required.',code:'ADMIN_REQUIRED'},403,{'X-OVYX-Request-ID':id});
    const config=await readConfig(context.env);
    if(context.request.method==='GET')return jsonResponse({ok:true,config:{pricing:config.pricing,tokenQuotas:config.tokenQuotas,dailyPromptQuotas:config.dailyPromptQuotas,planFeatures:{pro:AVAILABLE_FEATURES,max:AVAILABLE_FEATURES},planFeaturesManaged:false,gating:{},accessRules:[]},authority:'SERVER_ADMIN'},200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store, max-age=0'});
    if(context.request.method!=='POST')return jsonResponse({ok:false,error:'GET or POST is required.',code:'METHOD_NOT_ALLOWED'},405);
    const payload=await readJson(context.request,128000);
    const pricingIn=payload.pricing||{};
    const pro={ngn:cleanNumber(pricingIn.pro?.ngn,'Pro NGN price'),usd:cleanNumber(pricingIn.pro?.usd,'Pro USD price')};
    const max={ngn:cleanNumber(pricingIn.max?.ngn,'Max NGN price'),usd:cleanNumber(pricingIn.max?.usd,'Max USD price')};
    const tokenQuotas={free:cleanNumber(payload.tokenQuotas?.free??config.tokenQuotas.free,'Free token quota'),pro:cleanNumber(payload.tokenQuotas?.pro??config.tokenQuotas.pro,'Pro token quota'),max:cleanNumber(payload.tokenQuotas?.max??config.tokenQuotas.max,'Max token quota')};
    const cleanInteger=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Object.assign(new Error(label+' must be a whole number between 1 and 1,000,000.'),{status:400,code:'INVALID_PLAN_VALUE'});return n;};
    const dailyPromptQuotas={free:cleanInteger(payload.dailyPromptQuotas?.free??config.dailyPromptQuotas.free,'Free daily prompt quota'),pro:cleanInteger(payload.dailyPromptQuotas?.pro??config.dailyPromptQuotas.pro,'Pro daily prompt quota'),max:cleanInteger(payload.dailyPromptQuotas?.max??config.dailyPromptQuotas.max,'Max daily prompt quota')};
    const planFeatures={pro:AVAILABLE_FEATURES,max:AVAILABLE_FEATURES};
    const accessRules=[];
    const gating={};
    const next={...config,pricing:{pro,max},tokenQuotas,dailyPromptQuotas,planFeatures,planFeaturesManaged:false,accessRules,gating,updatedAt:new Date().toISOString(),quotaConfigUpdatedAt:new Date().toISOString(),updatedBy:String(user.sub||user.uid||user.email||'').slice(0,200)};
    await setFirestoreDocument(context.env,'plans','pro',{tier:'pro',pricing:pro,tokenQuota:tokenQuotas.pro,dailyPromptQuota:dailyPromptQuotas.pro,features:planFeatures.pro,updatedAt:next.updatedAt,updatedBy:next.updatedBy},{merge:true});
    await setFirestoreDocument(context.env,'plans','max',{tier:'max',pricing:max,tokenQuota:tokenQuotas.max,dailyPromptQuota:dailyPromptQuotas.max,features:planFeatures.max,updatedAt:next.updatedAt,updatedBy:next.updatedBy},{merge:true});
    await setFirestoreDocument(context.env,'system','config',{pricing:next.pricing,tokenQuotas:next.tokenQuotas,dailyPromptQuotas:next.dailyPromptQuotas,planFeatures:next.planFeatures,planFeaturesManaged:false,accessRules:[],gating:{},updatedAt:next.updatedAt,quotaConfigUpdatedAt:next.quotaConfigUpdatedAt,updatedBy:next.updatedBy},{merge:true});
    await recordAdminAuditEvent(context.env, { actor: user, action: 'plans.features.updated', resource: 'system/config', requestId: id });
    return jsonResponse({ok:true,config:{pricing:next.pricing,tokenQuotas:next.tokenQuotas,dailyPromptQuotas:next.dailyPromptQuotas,planFeatures:next.planFeatures,planFeaturesManaged:false,accessRules:[],gating:{}},authority:'SERVER_ADMIN'},200,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Plan configuration could not be saved.',code:error?.code||'PLAN_UPDATE_FAILED',requestId:id},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
