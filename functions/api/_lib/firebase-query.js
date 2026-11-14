'use strict';

const cryptoNode = require('node:crypto');

function serviceAccount(env){
  const raw=env?.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.'),{status:503,code:'FIREBASE_NOT_CONFIGURED'});
  const account=typeof raw==='string'?JSON.parse(raw):raw;
  if(!account?.client_email||!account?.private_key||!account?.project_id)throw Object.assign(new Error('Firebase service account is incomplete.'),{status:503,code:'FIREBASE_SERVICE_ACCOUNT_INVALID'});
  return account;
}
async function googleAccessToken(env){
  const a=serviceAccount(env),now=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const claim=Buffer.from(JSON.stringify({iss:a.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})).toString('base64url');
  const signer=cryptoNode.createSign('RSA-SHA256');signer.update(header+'.'+claim);const signature=signer.sign(a.private_key,'base64url');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+claim+'.'+signature})});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw Object.assign(new Error('Firebase service-account authentication failed.'),{status:503,code:'FIREBASE_AUTH_FAILED'});return d.access_token;
}
function value(v){
  if(!v||typeof v!=='object')return null;
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  if('booleanValue' in v)return Boolean(v.booleanValue);
  if('timestampValue' in v)return v.timestampValue;
  if('nullValue' in v)return null;
  if('referenceValue' in v)return v.referenceValue;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(value);
  if('mapValue' in v){const out={};for(const [k,x] of Object.entries(v.mapValue.fields||{}))out[k]=value(x);return out;}
  return null;
}
export async function findUserByExactEmail(env,email){
  const token=await googleAccessToken(env),a=serviceAccount(env);
  const url=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(a.project_id)}/databases/(default)/documents:runQuery`;
  const body={structuredQuery:{from:[{collectionId:'users'}],where:{fieldFilter:{field:{fieldPath:'email'},op:'EQUAL',value:{stringValue:String(email).trim().toLowerCase()}}},limit:2}};
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const rows=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error('Firestore email lookup failed.'),{status:503,code:'FIRESTORE_QUERY_FAILED'});
  const docs=(Array.isArray(rows)?rows:[]).filter(x=>x.document);
  if(docs.length!==1)throw Object.assign(new Error(docs.length?'Multiple user profiles match the verified payment email.':'No OVYX user profile matches the verified payment email.'),{status:409,code:docs.length?'FIRESTORE_EMAIL_NOT_UNIQUE':'FIRESTORE_USER_NOT_FOUND'});
  const name=String(docs[0].document.name||'');const marker='/documents/users/';const uid=name.includes(marker)?name.slice(name.indexOf(marker)+marker.length):'';
  return {uid,data:Object.fromEntries(Object.entries(docs[0].document.fields||{}).map(([k,v])=>[k,value(v)]))};
}

export async function findRecentPaymentsForUid(env, uid, limit = 8) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid || cleanUid.length > 150) {
    throw Object.assign(new Error('A verified account ID is required.'), {
      status: 400,
      code: 'PAYMENT_HISTORY_INVALID_IDENTITY',
    });
  }

  const maxResults = Math.min(20, Math.max(1, Math.floor(Number(limit) || 8)));
  const token = await googleAccessToken(env);
  const account = serviceAccount(env);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'payment_orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: cleanUid },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: maxResults,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw Object.assign(new Error('Payment history could not be loaded from the account store.'), {
      status: 503,
      code: 'PAYMENT_HISTORY_UNAVAILABLE',
    });
  }

  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.document && row.document.name)
    .map(row => {
      const document = row.document;
      const fields = Object.fromEntries(
        Object.entries(document.fields || {}).map(([key, field]) => [key, value(field)])
      );
      const name = String(document.name || '');
      const reference = name.split('/').filter(Boolean).pop() || '';
      return {
        reference,
        provider: String(fields.provider || ''),
        paymentMethod: String(fields.paymentMethod || ''),
        productType: String(fields.productType || ''),
        productId: String(fields.productId || ''),
        plan: String(fields.plan || ''),
        amount: Number.isFinite(Number(fields.amount)) ? Number(fields.amount) : null,
        currency: String(fields.currency || '').toUpperCase(),
        status: String(fields.status || 'pending'),
        fulfillmentStatus: String(fields.fulfillmentStatus || 'unfulfilled'),
        createdAt: String(fields.createdAt || ''),
        fulfilledAt: String(fields.fulfilledAt || ''),
      };
    });
}
