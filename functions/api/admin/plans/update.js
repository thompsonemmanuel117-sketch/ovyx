import { authenticateRequest, hasAdminClaim } from '../../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../../_lib/firebase-admin.js';
import { isRootUser } from '../../../_lib/brain/registry.js';
import { readJson, jsonResponse, requestId } from '../../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const ALLOWED_TIERS = new Set(['free', 'pro', 'max']);
const ALLOWED_FEATURES = new Set(['webStudio','advancedWebStudio','appStudio','gameStudio','aiGeneration','github','cloudflareDeploy','teamWorkspace','templates']);
const ALLOWED_GATES = new Set(['webstudio','advancedwebstudio','appstudio','gamestudio','aigeneration','github','cloudflaredeploy','teamworkspace','workspace','templates','admin-identity']);
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
  const email=String(user.email||'').trim().toLowerCase();
  if(email===ROOT_EMAIL.toLowerCase())return true;
  if(isRootUser(user))return true;
  return String(user.role||'').trim().toUpperCase()==='ROOT_SUPERUSER';
}
function normalizeFeatures(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>typeof x==='string'||(x&&typeof x==='object'))
    .map(x=>String(typeof x==='string'?x:(x.id||x.key||'')).trim())
    .filter(x=>ALLOWED_FEATURES.has(x))
    .filter((x,i,all)=>all.indexOf(x)===i);
}
function normalizeGating(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result={};
  for(const [rawKey,rawTier] of Object.entries(value).slice(0,40)){
    const key=String(rawKey||'').trim().slice(0,80);
    const normalizedKey=key.toLowerCase();
    const tier=String(rawTier||'').trim().toLowerCase();
    if(!ALLOWED_GATES.has(normalizedKey)||!['free','pro','max','root'].includes(tier))continue;
    result[key]=tier;
  }
  return result;
}
function normalizeAccessRules(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&typeof x==='object').map(rule=>({
    key:String(rule.key||'').trim().slice(0,140),
    name:String(rule.name||'').trim().slice(0,160),
    type:String(rule.type||'feature').trim().slice(0,80),
    tier:String(rule.tier||'free').trim().toLowerCase(),
    enabled:rule.enabled!==false,
    selector:String(rule.selector||'').trim().slice(0,500),
    description:String(rule.description||'').trim().slice(0,500)
  })).filter(rule=>rule.key&&rule.name&&ALLOWED_TIERS.has(rule.tier));
}
async function readConfig(env){
  const current=(await getFirestoreData(env,'system','config'))||{};
  return {...DEFAULTS,...current,
    pricing:{...DEFAULTS.pricing,...(current.pricing||{})},
    tokenQuotas:{...DEFAULTS.tokenQuotas,...(current.tokenQuotas||{})},
    dailyPromptQuotas:{...DEFAULTS.dailyPromptQuotas,...(current.dailyPromptQuotas||{})},
    planFeatures:{...DEFAULTS.planFeatures,...(current.planFeatures||{})},
    accessRules:Array.isArray(current.accessRules)?current.accessRules:[],
    gating:normalizeGating(current.gating)
  };
}
export async function onRequest(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    if(!isAdmin(user))return jsonResponse({ok:false,error:'Administrator authorization is required.',code:'ADMIN_REQUIRED'},403,{'X-OVYX-Request-ID':id});
    const config=await readConfig(context.env);
    if(context.request.method==='GET')return jsonResponse({ok:true,config:{pricing:config.pricing,tokenQuotas:config.tokenQuotas,dailyPromptQuotas:config.dailyPromptQuotas,planFeatures:config.planFeatures,planFeaturesManaged:config.planFeaturesManaged===true,gating:config.gating,accessRules:config.accessRules},authority:'SERVER_ADMIN'},200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store, max-age=0'});
    if(context.request.method!=='POST')return jsonResponse({ok:false,error:'GET or POST is required.',code:'METHOD_NOT_ALLOWED'},405);
    const payload=await readJson(context.request,128000);
    const pricingIn=payload.pricing||{};
    const pro={ngn:cleanNumber(pricingIn.pro?.ngn,'Pro NGN price'),usd:cleanNumber(pricingIn.pro?.usd,'Pro USD price')};
    const max={ngn:cleanNumber(pricingIn.max?.ngn,'Max NGN price'),usd:cleanNumber(pricingIn.max?.usd,'Max USD price')};
    const tokenQuotas={free:cleanNumber(payload.tokenQuotas?.free??config.tokenQuotas.free,'Free token quota'),pro:cleanNumber(payload.tokenQuotas?.pro??config.tokenQuotas.pro,'Pro token quota'),max:cleanNumber(payload.tokenQuotas?.max??config.tokenQuotas.max,'Max token quota')};
    const cleanInteger=(value,label)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Object.assign(new Error(label+' must be a whole number between 1 and 1,000,000.'),{status:400,code:'INVALID_PLAN_VALUE'});return n;};
    const dailyPromptQuotas={free:cleanInteger(payload.dailyPromptQuotas?.free??config.dailyPromptQuotas.free,'Free daily prompt quota'),pro:cleanInteger(payload.dailyPromptQuotas?.pro??config.dailyPromptQuotas.pro,'Pro daily prompt quota'),max:cleanInteger(payload.dailyPromptQuotas?.max??config.dailyPromptQuotas.max,'Max daily prompt quota')};
    const planFeatures={pro:normalizeFeatures(payload.features?.pro??config.planFeatures.pro),max:normalizeFeatures(payload.features?.max??config.planFeatures.max)};
    const accessRules=normalizeAccessRules(payload.accessRules??config.accessRules);
    const gating=normalizeGating(payload.gating??config.gating);
    const next={...config,pricing:{pro,max},tokenQuotas,dailyPromptQuotas,planFeatures,planFeaturesManaged:true,accessRules,gating,updatedAt:new Date().toISOString(),quotaConfigUpdatedAt:new Date().toISOString(),updatedBy:String(user.sub||user.uid||user.email||'').slice(0,200)};
    await setFirestoreDocument(context.env,'plans','pro',{tier:'pro',pricing:pro,tokenQuota:tokenQuotas.pro,dailyPromptQuota:dailyPromptQuotas.pro,features:planFeatures.pro,updatedAt:next.updatedAt,updatedBy:next.updatedBy},{merge:true});
    await setFirestoreDocument(context.env,'plans','max',{tier:'max',pricing:max,tokenQuota:tokenQuotas.max,dailyPromptQuota:dailyPromptQuotas.max,features:planFeatures.max,updatedAt:next.updatedAt,updatedBy:next.updatedBy},{merge:true});
    await setFirestoreDocument(context.env,'system','config',{pricing:next.pricing,tokenQuotas:next.tokenQuotas,dailyPromptQuotas:next.dailyPromptQuotas,planFeatures:next.planFeatures,planFeaturesManaged:true,accessRules:next.accessRules,gating:next.gating,updatedAt:next.updatedAt,quotaConfigUpdatedAt:next.quotaConfigUpdatedAt,updatedBy:next.updatedBy},{merge:true});
    return jsonResponse({ok:true,config:{pricing:next.pricing,tokenQuotas:next.tokenQuotas,dailyPromptQuotas:next.dailyPromptQuotas,planFeatures:next.planFeatures,planFeaturesManaged:true,accessRules:next.accessRules,gating:next.gating},authority:'SERVER_ADMIN'},200,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Plan configuration could not be saved.',code:error?.code||'PLAN_UPDATE_FAILED',requestId:id},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
