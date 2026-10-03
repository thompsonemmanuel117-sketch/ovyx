'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');
const { getServerPrice } = require('../_lib/payments/pricing.js');
const { ngnProduct } = require('../_lib/payments/catalog.js');
const { createCashierPayment } = require('../_lib/payments/opay-cashier.js');
const { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } = require('../_lib/payments/idempotency.js');
const { firestoreSet } = require('../_lib/firestore.js');
const { writeAuditLog } = require('../_lib/logger.js');

const MAX_BODY_BYTES=16*1024;
const ALLOWED_METHODS=['POST','OPTIONS'];

function clean(v,max=160){return String(v??'').trim().slice(0,max);}
function requestId(request){return request.headers.get('CF-Ray')||request.headers.get('X-Request-ID')||crypto.randomUUID();}
function phone(v){const p=clean(v,32);return p&&!/^\+?[0-9]{7,15}$/.test(p)?null:p;}
async function readJson(request){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error('REQUEST_TOO_LARGE');
  try{return JSON.parse(raw)}catch{throw new Error('INVALID_JSON');}
}
function orderNo(uid){return ('OVYX-'+clean(uid,12).replace(/[^A-Za-z0-9]/g,'').toUpperCase()+'-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,10)).slice(0,32);}
async function audit(env,payload){try{await writeAuditLog?.(env,payload)}catch{}}

async function handlePost(request,env){
  const id=requestId(request);
  const identity=await verifyFirebaseIdToken(request,env);
  if(!identity.ok)return identity.response;
  const activeEmail=clean(identity.user?.email,320).toLowerCase();
  if(!activeEmail)return errorResponse(400,'EMAIL_REQUIRED','A verified Firebase account email is required.');
  if(identity.user.emailVerified!==true)return errorResponse(403,'EMAIL_VERIFICATION_REQUIRED','Verify your OVYX email address before starting a payment.');
  let body;try{body=await readJson(request)}catch(e){return errorResponse(e.message==='REQUEST_TOO_LARGE'?413:400,e.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'INVALID_JSON',e.message==='REQUEST_TOO_LARGE'?'The payment request is too large.':'The payment request body is invalid.');}

  const kind=clean(body.productType||'subscription',32).toLowerCase();
  const productId=clean(body.productId||body.plan||body.tier,64).toLowerCase();
  const currency=clean(body.currency||'NGN',8).toUpperCase();
  if(currency!=='NGN')return errorResponse(400,'INVALID_CURRENCY','OPay Cashier checkout requires NGN.');
  const customerPhone=phone(body.phone);
  if(customerPhone===null)return errorResponse(400,'INVALID_PHONE','The supplied phone number is invalid.');

  let product;
  try{
    product=kind==='subscription'
      ? {...await getServerPrice(env,productId,currency),kind:'subscription',id:productId,tier:productId,name:`OVYX ${productId.toUpperCase()} Plan`}
      : ngnProduct(kind,productId);
  }catch(e){return errorResponse(e.status||400,e.code||'INVALID_PAYMENT_PRODUCT',e.message||'Invalid payment product.');}

  const key=clean(request.headers.get('Idempotency-Key')||body.idempotencyKey,128);
  if(!key)return errorResponse(400,'IDEMPOTENCY_KEY_REQUIRED','An Idempotency-Key is required for payment creation.');
  let idem;
  try{idem=await claimIdempotencyKey(env,key,{uid:identity.user.uid,operation:'payment.create',requestId:id});}catch{return errorResponse(503,'IDEMPOTENCY_UNAVAILABLE','Payment protection is temporarily unavailable.');}
  if(idem?.replay===true&&idem.response)return jsonResponse(idem.response.body,idem.response.status||200,{'X-OVYX-Request-ID':id});
  if(idem?.inProgress===true)return errorResponse(409,'PAYMENT_REQUEST_IN_PROGRESS','This payment request is already being processed.');

  const reference=orderNo(identity.user.uid),now=new Date(),expiresAt=new Date(now.getTime()+30*60*1000);
  const customerName=clean(body.userFullName||body.customerName||identity.user.displayName||activeEmail.split('@')[0]||'OVYX Customer',120);
  const record={
    uid:identity.user.uid,email:activeEmail,productType:product.kind,productId:product.id,plan:product.tier||null,
    tokens:product.tokens||0,currency:'NGN',amount:Number(product.amount),minorUnitAmount:Number(product.minorUnitAmount),
    provider:'opay',status:'pending',fulfillmentStatus:'unfulfilled',orderNo:reference,idempotencyKey:key,requestId:id,
    customerName,phone:customerPhone||null,createdAt:now.toISOString(),expiresAt:expiresAt.toISOString(),
    providerOrderNo:null,providerTransactionId:null
  };
  try{
    await firestoreSet(env,['payment_orders',reference],record);
    const origin=new URL(request.url).origin;
    const checkout=await createCashierPayment(env,{
      reference,amount:product.amount,
      returnUrl:`${origin}/?payment=complete&reference=${encodeURIComponent(reference)}`,
      callbackUrl:`${origin}/api/payments/opay-webhook`,
      cancelUrl:`${origin}/?payment=cancelled&reference=${encodeURIComponent(reference)}`,
      email:activeEmail,uid:identity.user.uid,customerName,phone:customerPhone,
      productName:product.name,description:product.kind==='subscription'?`OVYX ${product.tier.toUpperCase()} subscription`:`${product.name} · ${Number(product.tokens).toLocaleString()} AI tokens`
    });
    const updated={...record,providerOrderNo:checkout.orderNo||null,cashierUrl:checkout.cashierUrl,status:'pending',updatedAt:new Date().toISOString()};
    await firestoreSet(env,['payment_orders',reference],updated);
    const responseBody={ok:true,provider:'opay',reference,orderNo:reference,providerOrderNo:checkout.orderNo||null,cashierUrl:checkout.cashierUrl,checkoutUrl:checkout.cashierUrl,authorizationUrl:checkout.cashierUrl,productType:product.kind,productId:product.id,plan:product.tier||null,currency:'NGN',amount:product.amount,minorUnitAmount:product.minorUnitAmount,status:'pending',expiresAt:expiresAt.toISOString()};
    await completeIdempotencyKey(env,key,{status:200,body:responseBody});
    await audit(env,{user:identity.user.uid,action:'paymentInitiated',resource:`payment_orders/${reference}`,timestamp:new Date().toISOString(),requestId:id,result:'success',providerEventId:checkout.orderNo||reference});
    return jsonResponse(responseBody,200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
  }catch(error){
    try{await firestoreSet(env,['payment_orders',reference],{...record,status:'failed',failureCode:error.code||'OPAY_CREATE_FAILED',failureMessage:clean(error.message||'OPay order creation failed.',500),failedAt:new Date().toISOString()})}catch{}
    try{await releaseIdempotencyKey(env,key)}catch{}
    await audit(env,{user:identity.user.uid,action:'paymentCreationFailed',resource:`payment_orders/${reference}`,timestamp:new Date().toISOString(),requestId:id,result:'failure',providerEventId:null});
    return errorResponse(error.status||502,error.code||'OPAY_CREATE_FAILED',error.status===503?error.message:'OPay could not create the secure payment checkout.');
  }
}

async function onRequest(context){
  if(context.request.method==='OPTIONS')return new Response(null,{status:204,headers:{Allow:'POST, OPTIONS'}});
  if(context.request.method!=='POST')return errorResponse(405,'METHOD_NOT_ALLOWED','Only POST is supported.',{Allow:'POST, OPTIONS'});
  return handlePost(context.request,context.env);
}
module.exports={onRequest};