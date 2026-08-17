const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const adminJs = fs.readFileSync('js/admin.js', 'utf8');
const productHtml = fs.readFileSync('product.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260817140614_product_detail_fields.sql', 'utf8');

test('product detail columns are added without changing existing product logic', () => {
  for (const column of ['ingredients', 'allergens', 'nutritional_info', 'storage_info', 'shelf_life']) {
    assert.match(migration, new RegExp(`add column if not exists ${column} text`));
  }
});

test('admin product editor exposes product detail fields', () => {
  for (const id of ['p-ingredients', 'p-allergens', 'p-nutritional-info', 'p-storage-info', 'p-shelf-life']) {
    assert.match(adminHtml, new RegExp(`id="${id}"`));
  }
  assert.match(adminHtml, /js\/admin\.js\?v=22/);
});

test('admin product save loads and sends product detail fields', () => {
  for (const field of ['ingredients', 'allergens', 'nutritional_info', 'storage_info', 'shelf_life']) {
    assert.match(adminJs, new RegExp(field));
  }
  assert.match(adminJs, /delete fallbackPayload\.ingredients/);
  assert.match(adminJs, /delete fallbackPayload\.shelf_life/);
});

test('product detail page renders the editable fields', () => {
  assert.match(productHtml, /p\.ingredients/);
  assert.match(productHtml, /p\.allergens/);
  assert.match(productHtml, /p\.nutritional_info/);
  assert.match(productHtml, /p\.storage_info/);
  assert.match(productHtml, /p\.shelf_life/);
});
