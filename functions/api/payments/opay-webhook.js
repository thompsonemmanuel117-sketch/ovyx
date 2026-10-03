'use strict';

const { createHmac } = require('node:crypto');
const { getFirestoreDocument, getFirestoreData, setFirestoreDocumentIfCurrent } = require('../../_lib/firebase-admin.js');
const { findUserByExactEmail } = require('../_lib/firebase-query.js');
const { queryCashierPayment } = require('../_lib/payments/opay-cashier.js');
const { initializeQuotaProfile } = require('../../_lib/token-quota.js');
const { ngnProduct } = require('../_lib/payments/catalog.js');

function clean(v){return String(v??'').trim();}
function callbackString(p){
  return `{Amount:"${clean(p.amount)}",Currency:"${clean(p.currency)}",Reference:"${clean(p.reference)}",Refunded:${p.refunded?'t':'f'},Status:"${clean(p.status)}",Timestamp:"${clean(p.timestamp)}",Token:"${clean(p.token||'')}",TransactionID:"${clean(p.transactionId)}"}`;
}
function validSignature(payload,secret){
  const expected=createHmac('sha3-512',secret).update(callbackString(payload),'utf8').digest('hex');
  const actual=clean(payload?.sha512).toLowerCase();
  return actual.length===expected.length&&createHmac('sha256',actual).digest('hex')===createHmac('sha256',expected).digest('hex');
}
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function fulfill(env,record,user,product,provider){
  const doc=await getFirestoreDocument(env,'users',user.uid);
  const profile=doc?(await getFirestoreData(env,'users',user.uid)||{}):{};
  if(String(profile.lastPaymentReference||'')===String(record.orderNo||''))return;
  const now=new Date().toISOString();
  const base={paymentFulfillment:{reference:record.orderNo,providerTransactionId:provider.transactionId||'',fulfilledAt:now}};
  if(product.kind==='subscription'){
    await setFirestoreDocumentIfCurrent(env,'users',user.uid,{...base,planTier:product.tier,planTierState:'active',planActivatedAt:now,lastPaymentReference:record.orderNo,lastPaymentAmount:record.amount,lastPaymentCurrency:'NGN'},doc?.updateTime);
    await initializeQuotaProfile(env,user.uid,product.tier);
  }else{
    for(let attempt=0;attempt<5;attempt++){
      const currentDoc=await getFirestoreDocument(env,'users',user.uid);const current=currentDoc?(await getFirestoreData(env,'users',user.uid)||{}):{};
      const currentTokens=Math.max(0,Number(current.booster_tokens)||0);
      const nextTokens=currentTokens+product.tokens;
      const updated=await setFirestoreDocumentIfCurrent(env,'users',user.uid,{...base,booster_tokens:nextTokens,lastTokenBoosterId:product.id,lastTokenBoosterTokens:product.tokens,lastPaymentReference:record.orderNo,lastPaymentAmount:record.amount,lastPaymentCurrency:'NGN'},currentDoc?.updateTime).catch(e=>e);
      if(updated?.status===409||updated?.code==='FIRESTORE_PRECONDITION_FAILED')continue;
      if(updated instanceof Error)throw updated;
      return;
    }
    throw Object.assign(new Error('Unable to atomically credit token booster.'),{status:503,code:'TOKEN_CREDIT_CONFLICT'});
  }
}
async function onRequest(context){
  if(context.request.method!=='POST')return response({ok:false,error:'POST is required.'},405);
  let body;try{body=await context.request.json()}catch{return response({ok:false,error:'Invalid callback JSON.'},400);}
  const payload=body?.payload;
  if(!payload||String(body?.type||'')!=='transaction-status')return response({ok:false,error:'Invalid OPay callback payload.'},400);
  const secret=clean(context.env.OPAY_CASHIER_SECRET_KEY);if(!secret)return response({ok:false,error:'OPay callback secret is not configured.'},503);
  if(!validSignature(payload,secret))return response({ok:false,error:'Invalid OPay callback signature.'},401);
  const callbackStatus=clean(payload.status).toUpperCase();
  const reference=clean(payload.reference);if(!reference)return response({ok:false,error:'Missing payment reference.'},400);
  let providerStatus;try{providerStatus=await queryCashierPayment(context.env,{reference})}catch(e){return response({ok:false,error:'Provider status verification failed.'},503);}
  const provider=providerStatus?.data||{};
  if(clean(provider.reference)!==reference||clean(provider.status).toUpperCase()!=='SUCCESS'||Number(provider.amount?.total)!==Number(payload.amount)||clean(provider.amount?.currency).toUpperCase()!=='NGN')return response({ok:false,error:'Provider verification did not match the callback.'},409);
  const paymentDoc=await getFirestoreDocument(context.env,'payment_orders',reference);if(!paymentDoc)return response({ok:false,error:'Payment reference is not a known OVYX order.'},404);
  const record=await getFirestoreData(context.env,'payment_orders',reference)||{};
  const verifiedEmail=clean(record.email).toLowerCase();
  if(!verifiedEmail)return response({ok:false,error:'Payment metadata is missing the verified Firebase email.'},409);
  const claim=await setFirestoreDocumentIfCurrent(context.env,'payment_orders',reference,{fulfillmentStatus:'processing',processingStartedAt:new Date().toISOString()},paymentDoc.updateTime).catch(e=>e);
  if(claim?.status===409||claim?.code==='FIRESTORE_PRECONDITION_FAILED')return response({ok:true,alreadyProcessing:true},200);
  if(claim instanceof Error)throw claim;
  if(record.fulfillmentStatus==='fulfilled')return response({ok:true,alreadyFulfilled:true},200);
  const email=verifiedEmail;
  const user=await findUserByExactEmail(context.env,email);
  if(clean(user.data.email).toLowerCase()!==email)return response({ok:false,error:'Verified Firestore email mismatch.'},409);
  const product=ngnProduct(record.productType,record.productId);
  try{
    await fulfill(context.env,{...record,orderNo:reference},user,product,payload);
    const latest=await getFirestoreDocument(context.env,'payment_orders',reference);
    await setFirestoreDocumentIfCurrent(context.env,'payment_orders',reference,{status:'success',fulfillmentStatus:'fulfilled',providerTransactionId:clean(payload.transactionId),fulfilledAt:new Date().toISOString(),verifiedEmail:email},latest?.updateTime);
  }catch(error){
    const latest=await getFirestoreDocument(context.env,'payment_orders',reference).catch(()=>null);
    await setFirestoreDocumentIfCurrent(context.env,'payment_orders',reference,{fulfillmentStatus:'unfulfilled',fulfillmentError:clean(error?.message||'Fulfillment failed',500)},latest?.updateTime).catch(()=>{});
    throw error;
  }
  return response({ok:true,fulfilled:true,reference},200);
}
module.exports={onRequest};