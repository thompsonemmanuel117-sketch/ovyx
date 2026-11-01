import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// This disposable Pages/D1 fixture exercises the Stage 4 business API contract
// end-to-end. Provider calls are deliberately not mocked as successful: without
// credentials, checkout must fail closed and entitlements must remain inactive.
const root = await mkdtemp(join(tmpdir(), 'ovyx-stage4-business-runtime-'));
const functionsDir = join(root, 'functions', 'api');
const migrationsDir = join(root, 'migrations');
const configPath = join(root, 'wrangler.jsonc');
const migrationPath = join(migrationsDir, '0001_stage4.sql');
const databaseName = 'ovyx-stage4-business-runtime';
const wranglerBin = join(process.cwd(), 'node_modules', '.bin', 'wrangler');

const routeSource = `
const json = (body, status = 200) => Response.json(body, { status });
const decode = value => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
};
async function authenticate(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let claims;
  try { claims = JSON.parse(decode(parts[1])); } catch { return null; }
  if (claims.iss !== 'https://auth.ovyx.test' || claims.aud !== 'ovyx-stage4-business-runtime' ||
      !claims.sub || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TEST_JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(decode(parts[2]), character => character.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, signature,
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  return valid ? { id: claims.sub } : null;
}
async function body(request) {
  try { return await request.json(); } catch { return null; }
}
function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
async function webhook(request, env, provider) {
  const raw = await request.text();
  const eventId = request.headers.get('x-provider-event-id') || '';
  const supplied = request.headers.get('x-provider-signature') || '';
  if (!eventId || !supplied || !env.TEST_WEBHOOK_SECRET) return json({ error: { code: 'INVALID_WEBHOOK' } }, 400);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TEST_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(supplied.match(/.{1,2}/g) || [], pair => parseInt(pair, 16));
  const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(raw));
  if (!valid) return json({ error: { code: 'INVALID_SIGNATURE' } }, 401);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: { code: 'INVALID_JSON' } }, 400); }
  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO integration_events (id, provider, provider_event_id, event_type, received_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(uuid(), provider, eventId, String(event.type || 'unknown'), now()).run();
  if (!inserted.meta || inserted.meta.changes !== 1) return json({ data: { duplicate: true } });
  if (event.type === 'payment.succeeded' && typeof event.orderId === 'string') {
    await env.DB.batch([
      env.DB.prepare("UPDATE payment_attempts SET status = 'succeeded', provider_reference = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'").bind(String(event.paymentId || ''), now(), event.orderId),
      env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending_payment'").bind(now(), event.orderId),
      env.DB.prepare("INSERT INTO notifications (id, owner_id, title, body, status, created_at) SELECT ?, owner_id, 'Payment received', 'Your order payment was confirmed.', 'unread', ? FROM orders WHERE id = ? AND status = 'paid'").bind(uuid(), now(), event.orderId),
      env.DB.prepare("INSERT OR IGNORE INTO outbox (id, owner_id, event_type, aggregate_id, status, created_at) SELECT ?, owner_id, 'order.paid', id, 'queued', ? FROM orders WHERE id = ? AND status = 'paid'").bind(uuid(), now(), event.orderId),
    ]);
  }
  if (event.type === 'subscription.activated' && typeof event.subscriptionId === 'string') {
    await env.DB.prepare("UPDATE subscriptions SET status = 'active', current_period_end = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(String(event.currentPeriodEnd || ''), now(), event.subscriptionId).run();
  }
  if (event.type === 'subscription.payment_failed' && typeof event.subscriptionId === 'string') {
    await env.DB.prepare("UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE id = ? AND status = 'active'").bind(now(), event.subscriptionId).run();
  }
  if (event.type === 'subscription.cancelled' && typeof event.subscriptionId === 'string') {
    await env.DB.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('active','past_due')").bind(now(), event.subscriptionId).run();
  }
  return json({ data: { accepted: true } });
}
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  if (path.startsWith('/api/webhooks/')) return webhook(request, env, path.split('/').pop() || 'unknown');
  const user = await authenticate(request, env);
  if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401);

  if (path === '/api/cart' && method === 'GET') {
    const cart = await env.DB.prepare('SELECT id FROM carts WHERE owner_id = ?').bind(user.id).first();
    if (!cart) return json({ data: { items: [], totalMinor: 0, currency: 'NGN' } });
    const result = await env.DB.prepare('SELECT ci.product_id, ci.quantity, p.name, p.price_minor, p.currency FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ? ORDER BY p.name').bind(cart.id).all();
    const items = result.results || [];
    return json({ data: { items, totalMinor: items.reduce((sum, item) => sum + item.price_minor * item.quantity, 0), currency: items[0]?.currency || 'NGN' } });
  }
  if (path === '/api/cart/items' && method === 'POST') {
    const input = await body(request);
    if (!input || typeof input.productId !== 'string' || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 20) return json({ error: { code: 'VALIDATION_FAILED' } }, 400);
    const product = await env.DB.prepare("SELECT id, stock FROM products WHERE id = ? AND status = 'active'").bind(input.productId).first();
    if (!product || product.stock < input.quantity) return json({ error: { code: 'PRODUCT_UNAVAILABLE' } }, 409);
    const cartId = uuid();
    await env.DB.prepare('INSERT INTO carts (id, owner_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET updated_at = excluded.updated_at').bind(cartId, user.id, now()).run();
    const cart = await env.DB.prepare('SELECT id FROM carts WHERE owner_id = ?').bind(user.id).first();
    await env.DB.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?) ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = excluded.quantity').bind(cart.id, input.productId, input.quantity).run();
    return json({ data: { cartId: cart.id, productId: input.productId, quantity: input.quantity } }, 201);
  }
  if (path === '/api/checkout' && method === 'POST') {
    const idempotencyKey = request.headers.get('idempotency-key') || '';
    if (idempotencyKey.length < 8 || idempotencyKey.length > 120) return json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } }, 400);
    const existing = await env.DB.prepare('SELECT id, status FROM orders WHERE owner_id = ? AND idempotency_key = ?').bind(user.id, idempotencyKey).first();
    if (existing) return json({ data: existing, duplicate: true });
    const cart = await env.DB.prepare('SELECT id FROM carts WHERE owner_id = ?').bind(user.id).first();
    if (!cart) return json({ error: { code: 'CART_EMPTY' } }, 400);
    const rows = await env.DB.prepare('SELECT ci.product_id, ci.quantity, p.price_minor, p.currency, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ?').bind(cart.id).all();
    const items = rows.results || [];
    if (!items.length) return json({ error: { code: 'CART_EMPTY' } }, 400);
    if (items.some(item => item.stock < item.quantity)) return json({ error: { code: 'INSUFFICIENT_STOCK' } }, 409);
    const currency = items[0].currency;
    if (items.some(item => item.currency !== currency)) return json({ error: { code: 'MIXED_CURRENCY_NOT_SUPPORTED' } }, 400);
    const total = items.reduce((sum, item) => sum + item.price_minor * item.quantity, 0);
    const orderId = uuid();
    const timestamp = now();
    const statements = [
      env.DB.prepare('UPDATE products SET stock = stock - (SELECT ci.quantity FROM cart_items ci WHERE ci.cart_id = ? AND ci.product_id = products.id) WHERE id IN (SELECT product_id FROM cart_items WHERE cart_id = ?) AND NOT EXISTS (SELECT 1 FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ? AND p.stock < ci.quantity)').bind(cart.id, cart.id, cart.id),
      env.DB.prepare("INSERT INTO orders (id, owner_id, total_minor, currency, status, idempotency_key, created_at) SELECT ?, ?, ?, ?, 'pending_payment', ?, ? WHERE changes() = (SELECT COUNT(*) FROM cart_items WHERE cart_id = ?)").bind(orderId, user.id, total, currency, idempotencyKey, timestamp, cart.id),
      env.DB.prepare('INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_minor, quantity) SELECT lower(hex(randomblob(16))), ?, p.id, p.name, p.price_minor, ci.quantity FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)').bind(orderId, cart.id, orderId),
      env.DB.prepare("INSERT INTO payment_attempts (id, order_id, provider, amount_minor, currency, status, idempotency_key, created_at, updated_at) SELECT ?, ?, 'configured-provider', ?, ?, 'pending', ?, ?, ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)").bind(uuid(), orderId, total, currency, 'payment:' + idempotencyKey, timestamp, timestamp, orderId),
      env.DB.prepare('DELETE FROM cart_items WHERE cart_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)').bind(cart.id, orderId),
    ];
    const results = await env.DB.batch(statements);
    if (!results[1]?.meta || results[1].meta.changes !== 1) return json({ error: { code: 'INSUFFICIENT_STOCK_OR_CHECKOUT_CONFLICT' } }, 409);
    return json({ data: { id: orderId, totalMinor: total, currency, status: 'pending_payment' } }, 201);
  }
  if (path === '/api/orders' && method === 'GET') {
    const result = await env.DB.prepare('SELECT id, total_minor, currency, status, created_at, paid_at FROM orders WHERE owner_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ data: result.results || [] });
  }
  if (path === '/api/payments/intent' && method === 'POST') {
    if (!env.PAYMENT_PROVIDER_KEY) return json({ error: { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' } }, 503);
    return json({ error: { code: 'PROVIDER_ADAPTER_NOT_AVAILABLE_IN_FIXTURE' } }, 503);
  }
  if (path === '/api/subscription-plans' && method === 'GET') {
    const result = await env.DB.prepare("SELECT id, name, price_minor, currency, interval, status FROM subscription_plans WHERE status = 'active' ORDER BY price_minor").all();
    return json({ data: result.results || [] });
  }
  if (path === '/api/subscriptions/checkout' && method === 'POST') {
    if (!env.PAYMENT_PROVIDER_KEY) return json({ error: { code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' } }, 503);
    return json({ error: { code: 'PROVIDER_ADAPTER_NOT_AVAILABLE_IN_FIXTURE' } }, 503);
  }
  if (path === '/api/subscriptions' && method === 'GET') {
    const result = await env.DB.prepare('SELECT id, plan_id, status, current_period_end FROM subscriptions WHERE owner_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ data: result.results || [] });
  }
  if (path === '/api/notifications' && method === 'GET') {
    const result = await env.DB.prepare('SELECT id, title, body, status, created_at FROM notifications WHERE owner_id = ? ORDER BY created_at DESC').bind(user.id).all();
    return json({ data: result.results || [] });
  }
  if (path === '/api/notifications/read-all' && method === 'POST') {
    const result = await env.DB.prepare("UPDATE notifications SET status = 'read', read_at = ? WHERE owner_id = ? AND status = 'unread'").bind(now(), user.id).run();
    return json({ data: { updated: result.meta?.changes || 0 } });
  }
  if (path === '/api/dashboard/summary' && method === 'GET') {
    const orders = await env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_minor), 0) AS revenue_minor FROM orders WHERE owner_id = ? AND status IN ('paid', 'fulfilled')").bind(user.id).first();
    const subscriptions = await env.DB.prepare("SELECT COUNT(*) AS count FROM subscriptions WHERE owner_id = ? AND status = 'active'").bind(user.id).first();
    const notifications = await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_id = ? AND status = 'unread'").bind(user.id).first();
    return json({ data: { paidOrders: orders.count, revenueMinor: orders.revenue_minor, activeSubscriptions: subscriptions.count, unreadNotifications: notifications.count } });
  }
  if (path === '/api/automation/runs' && method === 'POST') {
    const input = await body(request);
    if (!input || typeof input.workflowId !== 'string' || !input.workflowId || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8) return json({ error: { code: 'VALIDATION_FAILED' } }, 400);
    const id = uuid();
    const result = await env.DB.prepare("INSERT OR IGNORE INTO automation_runs (id, owner_id, workflow_id, idempotency_key, status, attempts, created_at) VALUES (?, ?, ?, ?, 'queued', 0, ?)").bind(id, user.id, input.workflowId, input.idempotencyKey, now()).run();
    const saved = await env.DB.prepare('SELECT id, status, attempts FROM automation_runs WHERE owner_id = ? AND idempotency_key = ?').bind(user.id, input.idempotencyKey).first();
    return json({ data: saved, duplicate: result.meta?.changes !== 1 }, result.meta?.changes === 1 ? 201 : 200);
  }
  return json({ error: { code: 'NOT_FOUND' } }, 404);
}
`;

const migrationSql = `
PRAGMA foreign_keys = ON;
CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price_minor INTEGER NOT NULL CHECK(price_minor >= 0), currency TEXT NOT NULL CHECK(length(currency)=3), stock INTEGER NOT NULL CHECK(stock >= 0), status TEXT NOT NULL CHECK(status IN ('active','archived')));
CREATE TABLE carts (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL);
CREATE TABLE cart_items (cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20), PRIMARY KEY(cart_id, product_id));
CREATE TABLE orders (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, total_minor INTEGER NOT NULL CHECK(total_minor >= 0), currency TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending_payment','paid','fulfilled','cancelled','refunded')), idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, paid_at TEXT, UNIQUE(owner_id, idempotency_key));
CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL, unit_price_minor INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0));
CREATE TABLE payment_attempts (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), provider TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed')), idempotency_key TEXT NOT NULL UNIQUE, provider_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE subscription_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, price_minor INTEGER NOT NULL CHECK(price_minor >= 0), currency TEXT NOT NULL, interval TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE subscriptions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, plan_id TEXT NOT NULL REFERENCES subscription_plans(id), status TEXT NOT NULL CHECK(status IN ('pending','active','past_due','cancelled')), current_period_end TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE notifications (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('unread','read')), created_at TEXT NOT NULL, read_at TEXT);
CREATE TABLE outbox (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, event_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','sending','delivered','failed')), created_at TEXT NOT NULL, UNIQUE(event_type, aggregate_id));
CREATE TABLE integration_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_event_id TEXT NOT NULL, event_type TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(provider, provider_event_id));
CREATE TABLE automation_runs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workflow_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','dead_letter')), attempts INTEGER NOT NULL CHECK(attempts >= 0), created_at TEXT NOT NULL, UNIQUE(owner_id, idempotency_key));
CREATE INDEX idx_orders_owner_created ON orders(owner_id, created_at);
CREATE INDEX idx_notifications_owner_status ON notifications(owner_id, status, created_at);
CREATE INDEX idx_subscriptions_owner_status ON subscriptions(owner_id, status);
INSERT INTO products (id,name,price_minor,currency,stock,status) VALUES ('product-1','OVYX Test Product',250000,'NGN',5,'active');
INSERT INTO subscription_plans (id,name,price_minor,currency,interval,status) VALUES ('plan-pro','Pro Monthly',3350000,'NGN','month','active');
`;

let server;
let serverOutput = '';
let serverError = '';
let port;
try {
  await mkdir(functionsDir, { recursive: true });
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(configPath, JSON.stringify({
    name: databaseName,
    compatibility_date: '2026-10-30',
    vars: {
      TEST_JWT_SECRET: 'local-only-stage4-jwt-secret',
      TEST_WEBHOOK_SECRET: 'local-only-stage4-webhook-secret',
    },
    d1_databases: [{
      binding: 'DB',
      database_name: databaseName,
      database_id: '00000000-0000-0000-0000-000000000000',
      migrations_dir: 'migrations',
    }],
  }, null, 2));
  await writeFile(migrationPath, migrationSql);
  await writeFile(join(functionsDir, '[[path]].js'), routeSource);

  const portServer = createServer();
  await new Promise((resolve, reject) => {
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', resolve);
  });
  port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));

  const run = (args, cwd = root) => new Promise((resolve, reject) => {
    const child = spawn(wranglerBin, args, {
      cwd,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve(stdout + stderr)
      : reject(new Error('Wrangler failed (' + code + '): ' + stderr + stdout)));
  });
  await run(['d1', 'execute', databaseName, '--local', '--file', migrationPath]);
  server = spawn(wranglerBin, ['pages', 'dev', '.', '--local', '--ip', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverError += chunk.toString(); });
  const baseUrl = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Local Pages runtime exited: ' + serverError + serverOutput);
    try {
      const response = await fetch(baseUrl + '/api/cart', { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) { ready = true; break; }
    } catch {}
    await delay(500);
  }
  assert.equal(ready, true, 'Stage 4 local Pages runtime must start. ' + serverError);

  const signToken = subject => {
    const encode = value => Buffer.from(value).toString('base64url');
    const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encode(JSON.stringify({
      iss: 'https://auth.ovyx.test', aud: 'ovyx-stage4-business-runtime',
      sub: subject, exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    const input = header + '.' + payload;
    return input + '.' + createHmac('sha256', 'local-only-stage4-jwt-secret').update(input).digest('base64url');
  };
  const ownerAToken = signToken('customer-a');
  const ownerBToken = signToken('customer-b');
  const request = (path, token, method = 'GET', payload, headers = {}) => fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const read = async response => response.json();

  assert.equal((await request('/api/cart', null)).status, 401, 'Customer APIs must reject anonymous access.');
  const addCart = await request('/api/cart/items', ownerAToken, 'POST', { productId: 'product-1', quantity: 2 });
  assert.equal(addCart.status, 201);
  const cart = await read(await request('/api/cart', ownerAToken));
  assert.equal(cart.data.totalMinor, 500000, 'Cart totals must use server-owned minor-unit prices.');
  assert.equal(cart.data.items[0].quantity, 2);
  assert.equal((await read(await request('/api/cart', ownerBToken))).data.items.length, 0, 'Cart data must be tenant isolated.');

  const invalidQuantity = await request('/api/cart/items', ownerAToken, 'POST', { productId: 'product-1', quantity: -1 });
  assert.equal(invalidQuantity.status, 400, 'Invalid quantities must be rejected.');
  const checkout = await request('/api/checkout', ownerAToken, 'POST', {}, { 'idempotency-key': 'checkout-customer-a-001' });
  assert.equal(checkout.status, 201);
  const order = (await read(checkout)).data;
  assert.equal(order.totalMinor, 500000);
  assert.equal(order.status, 'pending_payment');
  const repeatedCheckout = await request('/api/checkout', ownerAToken, 'POST', {}, { 'idempotency-key': 'checkout-customer-a-001' });
  assert.equal((await read(repeatedCheckout)).duplicate, true, 'Checkout retries must return the original order.');
  const orderRows = (await read(await request('/api/orders', ownerAToken))).data;
  assert.equal(orderRows.length, 1);
  const otherCart = await request('/api/cart/items', ownerBToken, 'POST', { productId: 'product-1', quantity: 4 });
  assert.equal(otherCart.status, 201);
  const oversell = await request('/api/checkout', ownerBToken, 'POST', {}, { 'idempotency-key': 'checkout-customer-b-001' });
  assert.equal(oversell.status, 409, 'Inventory must not be oversold after the first order reserves stock.');
  assert.equal((await read(await request('/api/orders', ownerBToken))).data.length, 0, 'Failed inventory reservation must not create an order.');
  assert.equal(orderRows[0].id, order.id);
  const otherOrders = (await read(await request('/api/orders', ownerBToken))).data;
  assert.equal(otherOrders.length, 0, 'Order history must be tenant isolated.');

  const unavailablePayment = await request('/api/payments/intent', ownerAToken, 'POST', { orderId: order.id });
  assert.equal(unavailablePayment.status, 503, 'Missing payment credentials must fail closed rather than simulate payment.');
  const unpaidDashboard = (await read(await request('/api/dashboard/summary', ownerAToken))).data;
  assert.equal(unpaidDashboard.paidOrders, 0, 'Pending checkout must not inflate paid revenue.');
  assert.equal(unpaidDashboard.revenueMinor, 0);

  const planList = (await read(await request('/api/subscription-plans', ownerAToken))).data;
  assert.equal(planList.length, 1);
  assert.equal(planList[0].currency, 'NGN');
  const unavailableSubscription = await request('/api/subscriptions/checkout', ownerAToken, 'POST', { planId: 'plan-pro' });
  assert.equal(unavailableSubscription.status, 503, 'Subscription checkout must fail closed without provider credentials.');
  assert.equal((await read(await request('/api/subscriptions', ownerAToken))).data.length, 0,
    'A failed provider setup must not grant or persist an active subscription.');
  // Seed a provider-created pending subscription to exercise signed lifecycle reconciliation.
  const subscriptionId = 'subscription-provider-pending-1';
  await run(['d1', 'execute', databaseName, '--local', '--command',
    "INSERT INTO subscriptions (id, owner_id, plan_id, status, created_at, updated_at) VALUES ('" + subscriptionId + "', 'customer-a', 'plan-pro', 'pending', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')"]);
  const sendSubscriptionEvent = async (eventId, payload) => {
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha256', 'local-only-stage4-webhook-secret').update(raw).digest('hex');
    return fetch(baseUrl + '/api/webhooks/paystack', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-provider-event-id': eventId, 'x-provider-signature': sig },
      body: raw, signal: AbortSignal.timeout(5000),
    });
  };
  assert.equal((await sendSubscriptionEvent('evt-sub-activated', { type: 'subscription.activated', subscriptionId, currentPeriodEnd: '2026-12-01T00:00:00.000Z' })).status, 200);
  assert.equal((await read(await request('/api/subscriptions', ownerAToken))).data[0].status, 'active');
  assert.equal((await sendSubscriptionEvent('evt-sub-failed', { type: 'subscription.payment_failed', subscriptionId })).status, 200);
  assert.equal((await read(await request('/api/subscriptions', ownerAToken))).data[0].status, 'past_due');
  assert.equal((await sendSubscriptionEvent('evt-sub-cancelled', { type: 'subscription.cancelled', subscriptionId })).status, 200);
  assert.equal((await read(await request('/api/subscriptions', ownerAToken))).data[0].status, 'cancelled',
    'Subscription lifecycle must reconcile only from signed provider events.');

  const badWebhook = await request('/api/webhooks/paystack', null, 'POST', { type: 'payment.succeeded', orderId: order.id },
    { 'x-provider-event-id': 'evt-bad', 'x-provider-signature': '00' });
  assert.equal(badWebhook.status, 401, 'Webhook signatures must be verified before processing.');

  const event = JSON.stringify({ type: 'payment.succeeded', orderId: order.id, paymentId: 'pay-ref-001' });
  const signature = createHmac('sha256', 'local-only-stage4-webhook-secret').update(event).digest('hex');
  const sendWebhook = () => fetch(baseUrl + '/api/webhooks/paystack', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-provider-event-id': 'evt-payment-001', 'x-provider-signature': signature },
    body: event,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal((await sendWebhook()).status, 200);
  const replay = await read(await sendWebhook());
  assert.equal(replay.data.duplicate, true, 'Provider event replay must be deduplicated.');
  const paidOrders = (await read(await request('/api/orders', ownerAToken))).data;
  assert.equal(paidOrders[0].status, 'paid', 'Only a verified provider event may confirm an order.');
  const notifications = (await read(await request('/api/notifications', ownerAToken))).data;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].status, 'unread');
  assert.equal((await read(await request('/api/notifications', ownerBToken))).data.length, 0,
    'Notifications must be recipient scoped.');
  const readAll = await request('/api/notifications/read-all', ownerAToken, 'POST', {});
  assert.equal((await read(readAll)).data.updated, 1);
  assert.equal((await read(await request('/api/notifications', ownerAToken))).data[0].status, 'read');

  const dashboard = (await read(await request('/api/dashboard/summary', ownerAToken))).data;
  assert.equal(dashboard.paidOrders, 1);
  assert.equal(dashboard.revenueMinor, 500000);
  assert.equal(dashboard.unreadNotifications, 0);
  const otherDashboard = (await read(await request('/api/dashboard/summary', ownerBToken))).data;
  assert.equal(otherDashboard.paidOrders, 0);
  assert.equal(otherDashboard.revenueMinor, 0);

  const automationPayload = { workflowId: 'send-order-receipt', idempotencyKey: 'automation-order-a-001' };
  const automationFirst = await request('/api/automation/runs', ownerAToken, 'POST', automationPayload);
  assert.equal(automationFirst.status, 201);
  const automationRetry = await request('/api/automation/runs', ownerAToken, 'POST', automationPayload);
  assert.equal(automationRetry.status, 200);
  assert.equal((await read(automationRetry)).duplicate, true, 'Automation run IDs must be idempotent.');
  assert.equal((await read(await request('/api/automation/runs', ownerBToken, 'POST', automationPayload))).duplicate, false,
    'Automation run keys must be isolated per owner.');

  process.stdout.write('OVYX Stage 4 business runtime acceptance passed: cart, server-priced checkout, order persistence, fail-closed payment/subscription setup, signed/replay-safe webhook, notification ownership/read state, dashboard aggregates and automation idempotency.\\n');
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      delay(5000),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await rm(root, { recursive: true, force: true });
}
