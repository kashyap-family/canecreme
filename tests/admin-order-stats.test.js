const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const adminJs = fs.readFileSync('js/admin.js', 'utf8');

function extractFunction(name) {
  const match = new RegExp(`function ${name}\\s*\\(`).exec(adminJs);
  const start = match?.index ?? -1;
  assert.notEqual(start, -1, `${name} should exist`);
  const next = adminJs.indexOf('\nfunction ', start + 1);
  return adminJs.slice(start, next === -1 ? adminJs.length : next);
}

test('orders have one valid-order source of truth', () => {
  assert.match(adminJs, /function isValidOrder\(order\)/);
  assert.match(adminJs, /function getValidOrders\(\)/);
  assert.match(extractFunction('isValidOrder'), /!isCancelledOrder\(order\)/);
  assert.match(extractFunction('isValidOrder'), /!isDeletedOrder\(order\)/);
  assert.match(extractFunction('isValidOrder'), /!isFailedOrder\(order\)/);
  assert.match(extractFunction('isValidOrder'), /!isTestOrder\(order\)/);
  assert.match(extractFunction('isValidOrder'), /isSettledOrder\(order\)/);
});

test('order table and customer profiles use valid orders only', () => {
  assert.match(extractFunction('getFilteredOrders'), /return getValidOrders\(\)\.filter/);
  assert.match(extractFunction('buildCustomerProfiles'), /getValidOrders\(\)\.forEach/);
});

test('order summary cards exclude stale cancelled failed deleted and test orders', () => {
  const updateOrderMetrics = extractFunction('updateOrderMetrics');
  assert.match(updateOrderMetrics, /const validOrders = getValidOrders\(\)/);
  assert.match(updateOrderMetrics, /const total = validOrders\.length/);
  assert.match(updateOrderMetrics, /validOrders\.filter\(order => \['new', 'processing'\]/);
  assert.match(updateOrderMetrics, /normalizeOrderField\(order\.payment_status\) === 'paid'/);
  assert.match(updateOrderMetrics, /paymentStatus === 'cod' \|\| paymentMethod === 'cod'/);
  assert.doesNotMatch(updateOrderMetrics, /const total = allOrders\.length/);
});
