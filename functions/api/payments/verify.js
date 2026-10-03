'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');
const { firestoreGet, firestoreSet } = require('../_lib/firestore.js');
const { queryCashierPayment } = require('../_lib/payments/opay-cashier.js');
const { verifyPayment } = require('../_lib/payments/paystack.js');
const { getServerPrice, assertServerAmount, assertCurrency } = require('../_lib/payments/pricing.js');
const { ngnProduct, internationalProduct } = require('../_lib/payments/catalog.js');

function text(v,max=320){return String(v??'').trim().slice(0,max);}
function requestId(request){return request.headers.get('CF-Ray')||request.headers.get('X-Request-ID')||crypto.randomUUID();}
function amountForProvider(provider){
  const data=provider?.amount;
  if(data&&typeof data==='object')return data.total;
  return data;
}
function providerCurrency(provider){
  return text(provider?.currency||provider?.amount?.currency||'',8).toUpperCase();
}
async function onRequestGet(context){
  const id=requestId(context.request);
  const identity=await verifyFirebaseIdToken(context.request,context.env);
  if(!identity.ok)return identity.response;
  const reference=text(new URL(context.request.url).searchParams.get('reference')||new URL(context.request.url).searchParams.get('orderNo'),160);
  if(!reference)return errorResponse(400,'PAYMENT_REFERENCE_REQUIRED','A payment reference is required.',id);

  const payment=await firestoreGet(context.env,['payment_orders',reference]);
  if(!payment)return errorResponse(404,'PAYMENT_NOT_FOUND','The payment order was not found.',id);
  if(String(payment.uid||'')!==String(identity.user.uid||''))return errorResponse(403,'PAYMENT_ACCESS_DENIED','You are not allowed to access this payment.',id);

  const provider=String(payment.provider||'opay').toLowerCase();
  let verifiedData={};
  let status='pending';

  try{
    if(provider==='opay'){
      const response=await queryCashierPayment(context.env,{reference,orderNo:payment.providerOrderNo||undefined});
      verifiedData=response?.data||{};
      status=text(verifiedData.status).toLowerCase()||'pending';
      const expected=await getServerPrice(context.env,payment.plan,payment.currency||'NGN');
      assertServerAmount(expected.amount,amountForProvider(verifiedData)/100);
      assertCurrency(expected.currency,providerCurrency(verifiedData)||'NGN');
      if(text(verifiedData.reference||verifiedData.outOrderNo)!==reference)throw Object.assign(new Error('OPay reference mismatch.'),{status:409,code:'OPAY_REFERENCE_MISMATCH'});
    }else if(provider==='paystack'){
      const response=await verifyPayment(context.env,reference);
      verifiedData=response?.data||{};
      status=text(verifiedData.status).toLowerCase()||'pending';
      const expected=await getServerPrice(context.env,payment.plan,payment.currency||'USD');
      assertServerAmount(expected.amount,Number(verifiedData.amount)/100);
      assertCurrency(expected.currency,text(verifiedData.currency||'USD').toUpperCase());
      if(text(verifiedData.reference)!==reference)throw Object.assign(new Error('Paystack reference mismatch.'),{status:409,code:'PAYSTACK_REFERENCE_MISMATCH'});
    }else{
      return errorResponse(409,'PAYMENT_PROVIDER_UNSUPPORTED','This payment provider is not supported.',id);
    }
  }catch(error){
    return errorResponse(error.status||502,error.code||'PAYMENT_VERIFY_FAILED',error.message||'Payment verification failed.',id);
  }

  const normalized=status==='success'?'success':status==='failed'||status==='fail'||status==='canceled'||status==='cancel'?'failed':'pending';
  const now=new Date().toISOString();
  await firestoreSet(context.env,['payment_orders',reference],{
    lastQueriedStatus:status,
    lastReconciledAt:now,
    lastProviderAmount:Number(amountForProvider(verifiedData)||0),
    lastProviderCurrency:providerCurrency(verifiedData)||String(payment.currency||'').toUpperCase(),
    providerTransactionId:text(verifiedData.transactionId||verifiedData.payNo||verifiedData.id||payment.providerTransactionId||'',160),
    updatedAt:now
  });

  return jsonResponse({
    ok:true,
    provider,
    paymentMethod:String(payment.paymentMethod|| (provider==='paystack'?'international':'opay')),
    reference,
    status:normalized,
    providerStatus:status,
    plan:payment.plan||null,
    productType:payment.productType||null,
    productId:payment.productId||null,
    currency:String(payment.currency||'').toUpperCase(),
    amount:Number(payment.amount||0),
    fulfillmentStatus:String(payment.fulfillmentStatus||'unfulfilled'),
    fulfilled:payment.fulfillmentStatus==='fulfilled',
    serverAuthoritative:true,
    checkedAt:now
  },200,{'Cache-Control':'no-store','X-OVYX-Request-ID':id});
}
async function onRequest(context){
  if(context.request.method!=='GET')return errorResponse(405,'METHOD_NOT_ALLOWED','Only GET is supported.',requestId(context.request));
  return onRequestGet(context);
}
module.exports={onRequest};
