'use strict';

const BASE_URL = 'https://liveapi.opaycheckout.com/api/v1/international';
const CREATE_PATH = '/cashier/create';
const STATUS_PATH = '/cashier/status';

function required(value,name){const v=String(value??'').trim();if(!v)throw new Error(`Missing OPay configuration: ${name}`);return v;}
function config(env){
  const merchantId=required(env?.OPAY_MERCHANT_ID,'OPAY_MERCHANT_ID');
  const publicKey=required(env?.OPAY_CASHIER_PUBLIC_KEY,'OPAY_CASHIER_PUBLIC_KEY');
  const privateKey=required(env?.OPAY_CASHIER_SECRET_KEY,'OPAY_CASHIER_SECRET_KEY');
  return {merchantId,publicKey,privateKey,baseUrl:String(env?.OPAY_CASHIER_BASE_URL||BASE_URL).replace(/\/$/,'')};
}
async function hmacSha512(value,key){
  const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(value)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function request(env,path,payload,mode='secret'){
  const c=config(env);
  const body=JSON.stringify(payload);
  const authorization=mode==='public'?c.publicKey:await hmacSha512(body,c.privateKey);
  const response=await fetch(c.baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:`Bearer ${authorization}`,MerchantId:c.merchantId},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||String(data?.code||'00000')!=='00000')throw Object.assign(new Error(data?.message||`OPay returned HTTP ${response.status}.`),{status:502,code:'OPAY_PROVIDER_ERROR',provider:data});
  return data;
}
async function createCashierPayment(env,{reference,amount,returnUrl,callbackUrl,cancelUrl,email,uid,customerName,phone,productName,description}){
  const total=Math.round(Number(amount)*100);
  if(!Number.isSafeInteger(total)||total<=0)throw Object.assign(new Error('Invalid OPay amount.'),{status:400,code:'INVALID_AMOUNT'});
  const payload={
    country:'NG',
    reference:String(reference),
    amount:{total,currency:'NGN'},
    returnUrl:String(returnUrl),
    callbackUrl:String(callbackUrl),
    cancelUrl:String(cancelUrl),
    expireAt:30,
    customerVisitSource:'BROWSER',
    evokeOpay:false,
    userInfo:{
      userId:String(uid),
      userEmail:String(email),
      userName:String(customerName||'OVYX Customer'),
      ...(phone?{userMobile:String(phone)}:{})
    },
    product:{
      name:String(productName),
      description:String(description)
    }
  };
  const result=await request(env,CREATE_PATH,payload,'public');
  const data=result?.data||{};
  if(!data.cashierUrl)throw Object.assign(new Error('OPay did not return a cashier URL.'),{status:502,code:'OPAY_MISSING_CASHIER_URL'});
  return {reference:String(data.reference||reference),orderNo:String(data.orderNo||''),cashierUrl:String(data.cashierUrl),status:String(data.status||'INITIAL'),amount:data.amount||payload.amount};
}
async function queryCashierPayment(env,{reference,orderNo}){
  const payload={country:'NG'};
  if(reference)payload.reference=String(reference);
  if(orderNo)payload.orderNo=String(orderNo);
  if(!payload.reference&&!payload.orderNo)throw new Error('reference or orderNo is required');
  return request(env,STATUS_PATH,payload,'secret');
}
module.exports={createCashierPayment,queryCashierPayment,hmacSha512};