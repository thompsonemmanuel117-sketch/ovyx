'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');
const { getServerPrice } = require('../_lib/payments/pricing.js');
const { ngnProduct, internationalProduct } = require('../_lib/payments/catalog.js');
const { createCashierPayment } = require('../_lib/payments/opay-cashier.js');
const { initializePayment: initializePaystackPayment } = require('../_lib/payments/paystack.js');
const { claimIdempotencyKey, completeIdempotencyKey, releaseIdempotencyKey } = require('../_lib/payments/idempotency.js');
const { firestoreSet } = require('../_lib/firestore.js');
const { writeAuditLog } = require('../_lib/logger.js');

const MAX_BODY_BYTES=16*1024;

function clean(v,max=320){return String(v??'').trim().slice(0,max);}
function requestId(request){return request.headers.get('CF-Ray')||request.headers.get('X-Request-ID')||crypto.randomUUID();}
function phone(v){const p=clean(v,32);return p&&!/^\+?[0-9]{7,15}$/.test(p)?null:p;}
async function readJson(request){
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw Object.assign(new Error('REQUEST_TOO_LARGE'),{code:'REQUEST_TOO_LARGE'});
  try{return JSON.parse(raw)}catch{throw Object.assign(new Error('INVALID_JSON'),{code:'INVALID_JSON'});}
}
function orderNo(uid){return ('OVYX-'+clean(uid,12).replace(/[^A-Za-z0-9]/g,'').toUpperCase()+'-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,10)).slice(0,32);}
async function audit(env,payload){try{await writeAuditLog?.(env,payload)}catch{}}

async function handlePost(request,env){
  const id=requestId(request);
  const identity=await verifyFirebaseIdToken(request,env);
  if(!identity.ok)return identity.response;

  const activeEmail=clean(identity.user?.email).toLowerCase();
  if(!activeEmail)return errorResponse(400,'EMAIL_REQUIRED','A verified Firebase account email is required.');
  if(identity.user.emailVerified!==true)return errorResponse(403,'EMAIL_VERIFICATION_REQUIRED','Verify your OVYX email address before starting a payment.');

  let body;
  try{body=await readJson(request)}catch(e){return errorResponse(e.code==='REQUEST_TOO_LARGE'?413:400,e.code||'INVALID_JSON',e.code==='REQUEST_TOO_LARGE'?'The payment request is too large.':'The payment request body is invalid.');}

  const kind=clean(body.productType||'subscription',32).toLowerCase();
  const productId=clean(body.productId||body.plan||body.tier,64).toLowerCase();
  const requestedProvider=clean(body.provider||body.paymentMethod||'',32).toLowerCase();
  const currency=clean(body.currency||((requestedProvider==='paystack'||requestedProvider==='international')?'USD':'NGN'),8).toUpperCase();
  const provider=requestedProvider==='international'?'paystack':requestedProvider||((currency==='USD')?'paystack':'opay');

  if(!['opay','paystack'].includes(provider))return errorResponse(400,'INVALID_PAYMENT_PROVIDER','Choose OPay for Nigeria or Paystack for International checkout.');
  if(provider==='opay'&&currency!=='NGN')return errorResponse(400,'OPAY_CURRENCY_REQUIRED','OPay checkout requires NGN.');
  if(provider==='paystack'&&currency!=='USD')return errorResponse(400,'PAYSTACK_CURRENCY_REQUIRED','International Paystack checkout requires USD.');

  const customerPhone=phone(body.phone);
  if(customerPhone===null)return errorResponse(400,'INVALID_PHONE','The supplied phone number is invalid.');

  let product;
  try{
    if(kind==='subscription'){
      const price=await getServerPrice(env,productId,currency);
      product={...price,kind:'subscription',id:productId,tier:productId,name:`OVYX ${productId.toUpperCase()} Plan`};
    }else{
      product=provider==='opay'?ngnProduct(kind,productId):internationalProduct(kind,productId);
    }
  }catch(e){
    return errorResponse(e.status||400,e.code||'INVALID_PAYMENT_PRODUCT',e.message||'Invalid payment product.');
  }

  const key=clean(request.headers.get('Idempotency-Key')||body.idempotencyKey,128);
  if(!key)return errorResponse(400,'IDEMPOTENCY_KEY_REQUIRED','An Idempotency-Key is required for payment creation.');

  let idem;
  try{idem=await claimIdempotencyKey(env,key,{uid:identity.user.uid,operation:'payment.create',requestId:id});}
  catch{return errorResponse(503,'IDEMPOTENCY_UNAVAILABLE','Payment protection is temporarily unavailable.');}
  if(idem?.replay===true&&idem.response)return jsonResponse(idem.response.body,idem.response.status||200,{'X-OVYX-Request-ID':id});
  if(idem?.inProgress===true)return errorResponse(409,'PAYMENT_REQUEST_IN_PROGRESS','This payment request is already being processed.');

  const reference=orderNo(identity.user.uid);
  const now=new Date();
  const expiresAt=new Date(now.getTime()+30*60*1000);
  const customerName=clean(body.userFullName||body.customerName||identity.user.displayName||activeEmail.split('@')[0]||'OVYX Customer',120);

  const record={
    uid:identity.user.uid,
    email:activeEmail,
    productType:product.kind,
    productId:product.id,
    plan:product.tier||null,
    tokens:product.tokens||0,
    currency:product.currency,
    amount:Number(product.amount),
    minorUnitAmount:Number(product.minorUnitAmount),
    provider,
    paymentMethod:provider==='opay'?'opay':'international',
    status:'pending',
    fulfillmentStatus:'unfulfilled',
    orderNo:reference,
    idempotencyKey:key,
    requestId:id,
    customerName,
    phone:provider==='opay'?(customerPhone||null):null,
    createdAt:now.toISOString(),
    expiresAt:expiresAt.toISOString(),
    providerOrderNo:null,
    providerTransactionId:null
  };

  try{
    await firestoreSet(env,['payment_orders',reference],record);
    const origin=new URL(request.url).origin;
    let checkout;
    if(provider==='opay'){
      checkout=await createCashierPayment(env,{
        reference,amount:product.amount,
        returnUrl:`${origin}/?payment=complete&reference=${encodeURIComponent(reference)}`,
        callbackUrl:`${origin}/api/payments/opay-webhook`,
        cancelUrl:`${origin}/?payment=cancelled&reference=${encodeURIComponent(reference)}`,
        email:activeEmail,uid:identity.user.uid,customerName,phone:customerPhone,
        productName:product.name,
        description:product.kind==='subscription'?`OVYX ${product.tier.toUpperCase()} subscription`:`${product.name} · ${Number(product.tokens).toLocaleString()} AI tokens`
      });
    }else{
      checkout=await initializePaystackPayment(env,{
        reference,amount:product.amount,currency:'USD',email:activeEmail,uid:identity.user.uid,customerName,
        productName:product.name,
        description:product.kind==='subscription'?`OVYX ${product.tier.toUpperCase()} subscription`:`${product.name} · ${Number(product.tokens).toLocaleString()} AI tokens`,
        callbackUrl:`${origin}/?payment=complete&reference=${encodeURIComponent(reference)}`,
        returnUrl:`${origin}/?payment=complete&reference=${encodeURIComponent(reference)}`
      });
    }

    const updated={...record,providerOrderNo:checkout.orderNo||checkout.reference||null,providerTransactionId:null,cashierUrl:checkout.cashierUrl||null,authorizationUrl:checkout.authorizationUrl||null,status:'pending',updatedAt:new Date().toISOString()};
    await firestoreSet(env,['payment_orders',reference],updated);

    const checkoutUrl=checkout.cashierUrl||checkout.authorizationUrl||'';
    const responseBody={
      ok:true,
      provider,
      paymentMethod:record.paymentMethod,
      reference,
      orderNo:reference,
      providerOrderNo:updated.providerOrderNo,
      cashierUrl:checkout.cashierUrl||null,
      authorizationUrl:checkout.authorizationUrl||null,
      checkoutUrl,
      productType:product.kind,
      productId:product.id,
      plan:product.tier||null,
      currency:product.currency,
      amount:product.amount,
      minorUnitAmount:product.minorUnitAmount,
      status:'pending',
      expiresAt:expiresAt.toISOString()
    };

    await completeIdempotencyKey(env,key,{status:200,body:responseBody});
    await audit(env,{user:identity.user.uid,action:'paymentInitiated',resource:`payment_orders/${reference}`,timestamp:new Date().toISOString(),requestId:id,result:'success',providerEventId:updated.providerOrderNo||reference});
    return jsonResponse(responseBody,200,{'X-OVYX-Request-ID':id,'Cache-Control':'no-store'});
  }catch(error){
    try{await firestoreSet(env,['payment_orders',reference],{...record,status:'failed',failureCode:error.code||'PAYMENT_CREATE_FAILED',failureMessage:clean(error.message||'Payment creation failed.',500),failedAt:new Date().toISOString()})}catch{}
    try{await releaseIdempotencyKey(env,key)}catch{}
    await audit(env,{user:identity.user.uid,action:'paymentCreationFailed',resource:`payment_orders/${reference}`,timestamp:new Date().toISOString(),requestId:id,result:'failure',providerEventId:null});
    return errorResponse(error.status||502,error.code||'PAYMENT_CREATE_FAILED',clean(error.message||'Secure payment could not be created.',500));
  }
}

async function onRequest(context){
  if(context.request.method==='OPTIONS')return new Response(null,{status:204,headers:{Allow:'POST, OPTIONS'}});
  if(context.request.method!=='POST')return errorResponse(405,'METHOD_NOT_ALLOWED','Only POST is supported.',{Allow:'POST, OPTIONS'});
  return handlePost(context.request,context.env);
}
module.exports={onRequest};
