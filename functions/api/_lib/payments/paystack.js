'use strict';

const BASE_URL = 'https://api.paystack.co';

function text(value){return String(value ?? '').trim();}
function required(value,name){
  const v=text(value);
  if(!v)throw Object.assign(new Error(`Missing Paystack configuration: ${name}`),{status:503,code:'PAYSTACK_NOT_CONFIGURED'});
  return v;
}
function config(env){
  return {
    secretKey: required(env?.PAYSTACK_SECRET_KEY,'PAYSTACK_SECRET_KEY'),
    baseUrl:text(env?.PAYSTACK_BASE_URL||BASE_URL).replace(/\/$/,'')
  };
}
async function request(env,path,payload){
  const c=config(env);
  const response=await fetch(c.baseUrl+path,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${c.secretKey}`,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.status!==true){
    throw Object.assign(new Error(data?.message||`Paystack returned HTTP ${response.status}.`),{
      status:response.status>=400&&response.status<500?502:503,
      code:'PAYSTACK_PROVIDER_ERROR',
      provider:data
    });
  }
  return data;
}
async function hmacSha512(raw,secret){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
async function initializePayment(env,{reference,amount,currency,email,uid,customerName,productName,description,callbackUrl,returnUrl}){
  if(String(currency).toUpperCase()!=='USD')throw Object.assign(new Error('International Paystack checkout currently requires USD.'),{status:400,code:'PAYSTACK_CURRENCY_REQUIRED'});
  const total=Math.round(Number(amount)*100);
  if(!Number.isSafeInteger(total)||total<=0)throw Object.assign(new Error('Invalid Paystack amount.'),{status:400,code:'INVALID_AMOUNT'});
  const metadata=JSON.stringify({
    ovyx:{uid:String(uid),email:String(email).toLowerCase(),reference:String(reference),product:String(productName||''),description:String(description||'')}
  });
  const result=await request(env,'/transaction/initialize',{
    email:String(email).toLowerCase(),
    amount:String(total),
    currency:'USD',
    reference:String(reference),
    channels:['card'],
    callback_url:String(returnUrl||callbackUrl||''),
    metadata
  });
  const data=result?.data||{};
  if(!data.authorization_url||!data.reference)throw Object.assign(new Error('Paystack did not return a secure hosted checkout URL.'),{status:502,code:'PAYSTACK_MISSING_CHECKOUT_URL'});
  return {
    reference:String(data.reference),
    authorizationUrl:String(data.authorization_url),
    accessCode:String(data.access_code||''),
    amount:Number(amount),
    minorUnitAmount:total,
    currency:'USD',
    status:'pending'
  };
}
async function verifyPayment(env,reference){
  const c=config(env);
  const ref=encodeURIComponent(String(reference||'').trim());
  if(!ref)throw Object.assign(new Error('A Paystack reference is required.'),{status:400,code:'PAYSTACK_REFERENCE_REQUIRED'});
  const response=await fetch(`${c.baseUrl}/transaction/verify/${ref}`,{
    method:'GET',
    headers:{Authorization:`Bearer ${c.secretKey}`,Accept:'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.status!==true)throw Object.assign(new Error(data?.message||`Paystack verification returned HTTP ${response.status}.`),{status:response.status>=400&&response.status<500?502:503,code:'PAYSTACK_VERIFY_FAILED',provider:data});
  return data;
}
module.exports={initializePayment,verifyPayment,hmacSha512};