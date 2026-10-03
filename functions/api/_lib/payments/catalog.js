'use strict';

const SUBSCRIPTIONS = Object.freeze({
  pro: Object.freeze({ id:'pro', kind:'subscription', tier:'pro', name:'OVYX Pro', amount:33500, tokens:500000, dailyPrompts:20 }),
  max: Object.freeze({ id:'max', kind:'subscription', tier:'max', name:'OVYX Max', amount:209375, tokens:5000000, dailyPrompts:100 })
});

const BOOSTERS = Object.freeze({
  starter: Object.freeze({ id:'starter', kind:'token_booster', name:'Starter Token Booster', amount:3500, tokens:100000 }),
  builder: Object.freeze({ id:'builder', kind:'token_booster', name:'Builder Token Booster', amount:12000, tokens:500000 }),
  studio: Object.freeze({ id:'studio', kind:'token_booster', name:'Studio Token Booster', amount:30000, tokens:1500000 })
});

const INTERNATIONAL_BOOSTERS = Object.freeze({
  starter: Object.freeze({ id:'starter', kind:'token_booster', name:'Starter Token Booster', amount:2.99, tokens:100000 }),
  builder: Object.freeze({ id:'builder', kind:'token_booster', name:'Builder Token Booster', amount:9.99, tokens:500000 }),
  studio: Object.freeze({ id:'studio', kind:'token_booster', name:'Studio Token Booster', amount:24.99, tokens:1500000 })
});

function money(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}
function normalizeId(value){return String(value||'').trim().toLowerCase();}
function product(table,id,currency){
  const item=table[normalizeId(id)];
  if(!item) throw Object.assign(new Error('Unknown OVYX payment product.'),{status:400,code:'INVALID_PAYMENT_PRODUCT'});
  return {...item,currency,amount:money(item.amount),minorUnitAmount:Math.round(money(item.amount)*100)};
}
function ngnProduct(kind,id){
  if(kind==='subscription')return product(SUBSCRIPTIONS,id,'NGN');
  return product(BOOSTERS,id,'NGN');
}
function internationalProduct(kind,id){
  if(kind!=='token_booster')throw Object.assign(new Error('International checkout is currently available for subscriptions through the server pricing matrix and token boosters through the fixed USD catalog.'),{status:400,code:'INVALID_INTERNATIONAL_PRODUCT'});
  return product(INTERNATIONAL_BOOSTERS,id,'USD');
}
module.exports={SUBSCRIPTIONS,BOOSTERS,INTERNATIONAL_BOOSTERS,ngnProduct,internationalProduct};
