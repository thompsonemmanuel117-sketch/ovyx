'use strict';

/*
 * Compatibility endpoint.
 *
 * OPay Cashier webhooks are fulfilled exclusively by the
 * authoritative /api/payments/opay-webhook route.
 * Keep this legacy URL as a transparent server-side delegate
 * so older configured callbacks cannot execute a different
 * fulfillment implementation.
 */
const { onRequest: onOpayCashierWebhook } = require('./opay-webhook.js');

async function onRequest(context){
  return onOpayCashierWebhook(context);
}

module.exports={onRequest};
