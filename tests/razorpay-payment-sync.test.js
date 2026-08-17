const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const checkout = read('js', 'checkout.js');
const checkoutHtml = read('checkout.html');
const createRazorpayOrder = read('supabase', 'functions', 'create-razorpay-order', 'index.ts');
const confirmPaidOrder = read('supabase', 'functions', 'confirm-paid-order', 'index.ts');
const webhook = read('supabase', 'functions', 'razorpay-webhook', 'index.ts');
const config = read('supabase', 'config.toml');
const migration = read('supabase', 'migrations', '20260817090000_razorpay_payment_sync_hardening.sql');
const createCheckoutOrder = read('supabase', 'functions', 'create-checkout-order', 'index.ts');

test('checkout creates a Razorpay Orders API order before opening Checkout', () => {
  assert.match(checkout, /async function createRazorpayOrder\(orderId\)/);
  assert.match(checkout, /functions\/v1\/create-razorpay-order/);
  assert.match(checkout, /const razorpayOrder = await createRazorpayOrder\(currentOrderId\)/);
  assert.match(checkout, /order_id: razorpayOrder\.razorpay_order_id/);
  assert.match(checkoutHtml, /js\/checkout\.js\?v=23/);
});

test('checkout sends Razorpay signature fields to server confirmation', () => {
  assert.match(checkout, /razorpay_order_id: razorpayOrderId/);
  assert.match(checkout, /razorpay_signature: razorpaySignature/);
  assert.match(checkout, /response\.razorpay_order_id \|\| razorpayOrder\.razorpay_order_id/);
  assert.match(checkout, /response\.razorpay_signature/);
});

test('Razorpay order function stores and reuses linked provider order IDs', () => {
  assert.match(createRazorpayOrder, /order\.razorpay_order_id/);
  assert.match(createRazorpayOrder, /reused: true/);
  assert.match(createRazorpayOrder, /razorpay_order_id: razorpayData\.id/);
  assert.match(createRazorpayOrder, /payment_method: "online"/);
});

test('confirmation verifies signature or checks captured payment through Razorpay API', () => {
  assert.match(confirmPaidOrder, /verifyRazorpaySignature/);
  assert.match(confirmPaidOrder, /Razorpay signature verification failed/);
  assert.match(confirmPaidOrder, /https:\/\/api\.razorpay\.com\/v1\/payments/);
  assert.match(confirmPaidOrder, /payment\.status !== "captured"/);
  assert.match(confirmPaidOrder, /payment_status: "paid"/);
});

test('confirmation is idempotent for already-paid orders', () => {
  assert.match(confirmPaidOrder, /order\.payment_status === "paid"/);
  assert.match(confirmPaidOrder, /already_paid: true/);
  assert.match(confirmPaidOrder, /event_type: "checkout\.verified"/);
});

test('webhook verifies raw body signatures and uses Razorpay event ID idempotency', () => {
  assert.match(webhook, /const rawBody = await req\.text\(\)/);
  assert.match(webhook, /x-razorpay-signature/);
  assert.match(webhook, /verifyWebhookSignature\(rawBody, signature, webhookSecret\)/);
  assert.match(webhook, /x-razorpay-event-id/);
  assert.match(webhook, /provider_event_id=eq/);
});

test('webhook marks captured payments and order.paid events as paid', () => {
  assert.match(webhook, /\["payment\.captured", "order\.paid"\]/);
  assert.match(webhook, /payment_status: "paid"/);
  assert.match(webhook, /order_status: order\.order_status === "cancelled" \? order\.order_status : "processing"/);
  assert.match(webhook, /razorpay_payment_synced/);
});

test('Supabase config exposes the Razorpay webhook without platform JWT checks', () => {
  assert.match(config, /\[functions\.razorpay-webhook\]\s+verify_jwt = false/);
});

test('migration adds payment idempotency indexes and Razorpay order uniqueness', () => {
  assert.match(migration, /provider_event_id/);
  assert.match(migration, /payment_events_provider_event_key/);
  assert.match(migration, /payment_events_provider_payment_event_key/);
  assert.match(migration, /orders_razorpay_order_id_key/);
  assert.match(migration, /create table if not exists public\.order_side_effects/);
  assert.match(migration, /unique \(order_id, effect_type\)/);
});

test('checkout order creation reuses a linked pending checkout order', () => {
  assert.match(createCheckoutOrder, /getReusableCheckoutOrder/);
  assert.match(createCheckoutOrder, /getRecentReusablePendingOrder/);
  assert.match(createCheckoutOrder, /abandoned_checkouts\?select=order_id/);
  assert.match(createCheckoutOrder, /reused: true/);
  assert.match(createCheckoutOrder, /reuse_reason: "recent_pending_match"/);
  assert.match(createCheckoutOrder, /last_step: "order_created"/);
  assert.match(createCheckoutOrder, /payment_method: paymentMethod/);
});

test('post-payment email and shipment side effects are one-time locked', () => {
  assert.match(confirmPaidOrder, /claimOrderSideEffect/);
  assert.match(confirmPaidOrder, /order_side_effects/);
  assert.match(confirmPaidOrder, /order_confirmation_email/);
  assert.match(confirmPaidOrder, /rapidshyp_order/);
  assert.match(webhook, /processPostPaymentSideEffects/);
  assert.match(webhook, /rapidshyp_skipped/);
});
