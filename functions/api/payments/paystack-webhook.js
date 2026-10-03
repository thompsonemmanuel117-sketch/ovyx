'use strict';

const { hmacSha512, verifyPayment } = require('../_lib/payments/paystack.js');
const { claimIdempotencyKey, completeIdempotencyKey } = require('../_lib/payments/idempotency.js');
const { internationalProduct } = require('../_lib/payments/catalog.js');

function text(v,max=500){return String(v??'').trim().slice(0,max);}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
async function firebase(){
  return import('../../_lib/firebase-admin.js');
}
async function quota(){
  return import('../../../_lib/token-quota.js');
}
async function fulfill(env,record,user,product,provider){
  const fb=await firebase();
  const doc=await fb.getFirestoreDocument(env,'users',user.uid);
  const profile=doc?(await fb.getFirestoreData(env,'users',user.uid)||{}):{};
  if(String(profile.lastPaymentReference||'')===String(record.orderNo||''))return;
  const now=new Date().toISOString();
  if(product.kind==='subscription'){
    await fb.setFirestoreDocumentIfCurrent(env,'users',user.uid,{
      paymentFulfillment:{reference:record.orderNo,providerTransactionId:provider.id?String(provider.id):'',fulfilledAt:now},
      planTier:product.tier,
      planTierState:'active',
      subscriptionStatus:'active',
      paymentStatus:'paid',
      paymentProvider:'paystack',
      paymentReference:record.orderNo,
      paymentOrderNo:record.orderNo,
      paymentTransactionId:String(provider.id||''),
      paymentCurrency:'USD',
      paymentAmount:record.amount,
      paidAt:now,
      lastPaymentAt:now,
      lastPaymentReference:record.orderNo,
      updatedAt:now
    },doc?.updateTime);
    const tq=await quota();
    await tq.initializeQuotaProfile(env,user.uid,product.tier);
  }else{
    for(let attempt=0;attempt<6;attempt++){
      const currentDoc=await fb.getFirestoreDocument(env,'users',user.uid);
      const current=currentDoc?(await fb.getFirestoreData(env,'users',user.uid)||{}):{};
      const currentTokens=Math.max(0,Number(current.booster_tokens)||0);
      const nextTokens=currentTokens+Number(product.tokens||0);
      try{
        await fb.setFirestoreDocumentIfCurrent(env,'users',user.uid,{
          paymentFulfillment:{reference:record.orderNo,providerTransactionId:provider.id?String(provider.id):'',fulfilledAt:now},
          booster_tokens:nextTokens,
          is_monthly_exhausted:Boolean(current.is_monthly_exhausted),
          lastTokenBoosterId:product.id,
          lastTokenBoosterTokens:product.tokens,
          lastPaymentReference:record.orderNo,
          lastPaymentAmount:record.amount,
          lastPaymentCurrency:'USD',
          updatedAt:now
        },currentDoc?.updateTime);
        return;
      }catch(e){
        if(e?.status===409||e?.code==='FIRESTORE_PRECONDITION_FAILED')continue;
        throw e;
      }
    }
    throw Object.assign(new Error('Unable to credit the international token booster safely.'),{status:503,code:'TOKEN_CREDIT_CONFLICT'});
  }
}
async function onRequest(context){
  if(context.request.method!=='POST')return json({ok:false,error:'POST is required.'},405);
  const secret=text(context.env?.PAYSTACK_SECRET_KEY,5000);
  if(!secret)return json({ok:false,error:'Paystack secret key is not configured.'},503);

  const raw=await context.request.text();
  const signature=text(context.request.headers.get('x-paystack-signature'),200).toLowerCase();
  if(!signature)return json({ok:false,error:'Paystack signature is required.'},401);
  const expected=await hmacSha512(raw,secret);
  if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return json({ok:false,error:'Invalid Paystack webhook signature.'},401);

  let body;try{body=JSON.parse(raw)}catch{return json({ok:false,error:'Invalid webhook JSON.'},400);}
  if(text(body?.event)!=='charge.success')return json({ok:true,ignored:true,event:text(body?.event,80)},200);

  const data=body?.data||{};
  const reference=text(data.reference,160);
  if(!reference)return json({ok:false,error:'Paystack reference is required.'},400);

  let verified;
  try{verified=await verifyPayment(context.env,reference)}catch{return json({ok:false,error:'Paystack server verification failed.'},503);}
  const transaction=verified?.data||{};
  if(text(transaction.status).toLowerCase()!=='success'||text(transaction.reference)!==reference||text(transaction.currency).toUpperCase()!=='USD'||Number(transaction.amount)!==Number(data.amount))return json({ok:false,error:'Paystack verification did not match the webhook transaction.'},409);

  const fb=await firebase();
  const paymentDoc=await fb.getFirestoreDocument(context.env,'payment_orders',reference);
  if(!paymentDoc)return json({ok:false,error:'OVYX payment order not found.'},404);
  const record=await fb.firestoreDocumentToJs(paymentDoc);
  if(text(record.provider)!=='paystack'||text(record.paymentMethod)!=='international'||text(record.currency).toUpperCase()!=='USD')return json({ok:false,error:'Payment provider or method mismatch.'},409);

  const metadata=transaction.metadata?.ovyx||transaction.metadata?.ovyx_metadata||null;
  if(metadata&&text(metadata.reference)!==reference)return json({ok:false,error:'Paystack metadata reference mismatch.'},409);
  const verifiedEmail=text(record.email,320).toLowerCase();
  if(!verifiedEmail)return json({ok:false,error:'Payment order has no verified account email.'},409);

  const eventKey=`paystack:${reference}:${text(transaction.id,160)||'charge-success'}`;
  const claim=await claimIdempotencyKey(context.env,eventKey,{uid:record.uid,operation:'payment.webhook.paystack',requestId:text(context.request.headers.get('CF-Ray'),160)||reference});
  if(claim?.replay===true)return json({ok:true,alreadyFulfilled:true},200);
  if(claim?.inProgress===true)return json({ok:true,alreadyProcessing:true},200);

  if(record.fulfillmentStatus==='fulfilled')return json({ok:true,alreadyFulfilled:true},200);

  const userQuery=await (await import('../_lib/firebase-query.js')).findUserByExactEmail(context.env,verifiedEmail);
  if(text(userQuery?.data?.email).toLowerCase()!==verifiedEmail)return json({ok:false,error:'Verified account email mismatch.'},409);

  let product;
  if(record.productType==='subscription'){
    const priceModule=await import('../_lib/payments/pricing.js');
    const price=await priceModule.getServerPrice(context.env,record.productId,'USD');
    if(Number(price.minorUnitAmount)!==Number(data.amount))return json({ok:false,error:'Server price and Paystack amount do not match.'},409);
    product={...price,kind:'subscription',id:record.productId,tier:record.productId,name:`OVYX ${record.productId.toUpperCase()} Plan`};
  }else{
    product=internationalProduct(record.productType,record.productId);
    if(Number(product.minorUnitAmount)!==Number(data.amount))return json({ok:false,error:'International booster amount does not match the server catalog.'},409);
  }

  try{
    await fulfill(context.env,record,{uid:userQuery.uid},product,transaction);
    const latest=await fb.getFirestoreDocument(context.env,'payment_orders',reference);
    await fb.setFirestoreDocumentIfCurrent(context.env,'payment_orders',reference,{
      status:'success',
      fulfillmentStatus:'fulfilled',
      providerTransactionId:String(transaction.id||''),
      providerOrderNo:String(transaction.reference||reference),
      verifiedEmail,
      verifiedProvider:'paystack',
      fulfilledAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    },latest?.updateTime);
    await completeIdempotencyKey(context.env,eventKey,{status:200,body:{ok:true,fulfilled:true,reference}});
    return json({ok:true,fulfilled:true,reference},200);
  }catch(error){
    const latest=await fb.getFirestoreDocument(context.env,'payment_orders',reference).catch(()=>null);
    await fb.setFirestoreDocumentIfCurrent(context.env,'payment_orders',reference,{fulfillmentStatus:'unfulfilled',fulfillmentError:text(error?.message||'Paystack fulfillment failed.',500),updatedAt:new Date().toISOString()},latest?.updateTime).catch(()=>{});
    throw error;
  }
}
module.exports={onRequest};