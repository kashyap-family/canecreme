// ===== ADMIN PANEL =====

let currentOrderId = null;
let allOrders = [];
let allAbandonedCheckouts = [];
let activeAdminTab = 'products';
let ordersRefreshTimer = null;
let ordersLoading = false;
let abandonedLoading = false;

const ADMIN_TIME_ZONE = 'Asia/Kolkata';
const ORDERS_REFRESH_MS = 10000;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeWhatsappPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

function formatOrderItems(items) {
  if (!items.length) return 'Products: Not available';
  return items.map(item => {
    const name = item.products ? item.products.name : 'Product';
    return `${name} x ${item.quantity} - Rs. ${(item.price * item.quantity).toFixed(2)}`;
  }).join('\n');
}

function renderOrderItemRows(items) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="4" style="padding:1rem;color:#6b6b6b;text-align:center;">
          No item details were saved for this order.
        </td>
      </tr>
    `;
  }

  return items.map(item => `
    <tr>
      <td>
        ${escapeHtml(item.products ? item.products.name : 'Product')}
        ${item.source === 'price_inference' ? '<br><small style="color:#6b6b6b;">Estimated from order total</small>' : ''}
      </td>
      <td>${item.quantity}</td>
      <td>₹${parseFloat(item.price).toFixed(2)}</td>
      <td>₹${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function getShortOrderId(order) {
  return String(order.order_number || order.id || '').slice(0, 8).toUpperCase();
}

function getAddressText(order) {
  const addr = order.shipping_address || {};
  return [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.pin].filter(Boolean).join(' '),
    addr.country
  ].filter(Boolean).join(', ');
}

function parseOrderCreatedAt(value) {
  if (!value) return null;
  const raw = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasTimezone ? raw : `${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getOrderDate(order) {
  const date = parseOrderCreatedAt(order.created_at);
  if (!date) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
    timeZoneName: 'short'
  });
}

function getIndiaDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function isWithinDateFilter(order, filterValue) {
  if (filterValue === 'all') return true;
  const created = parseOrderCreatedAt(order.created_at);
  if (!created) return false;
  const now = new Date();

  if (filterValue === 'today') {
    return getIndiaDateKey(created) === getIndiaDateKey(now);
  }

  const days = Number(filterValue);
  if (!Number.isFinite(days)) return true;
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);
  return created >= cutoff;
}

function getOrderSearchText(order) {
  return [
    order.id,
    order.order_number,
    order.customer_name,
    order.customer_email,
    order.customer_phone,
    order.payment_status,
    order.order_status,
    getAddressText(order)
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeOrderField(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isDeletedOrder(order) {
  return Boolean(order?.deleted_at || order?.is_deleted || order?.deleted);
}

function isCancelledOrder(order) {
  return normalizeOrderField(order?.order_status) === 'cancelled';
}

function isFailedOrder(order) {
  const paymentStatus = normalizeOrderField(order?.payment_status);
  const orderStatus = normalizeOrderField(order?.order_status);
  return ['failed', 'failure', 'payment_failed'].includes(paymentStatus) ||
    ['failed', 'failure', 'payment_failed'].includes(orderStatus);
}

function isTestOrder(order) {
  const haystack = [
    order?.id,
    order?.order_number,
    order?.customer_name,
    order?.customer_email,
    order?.customer_phone,
    order?.payment_id,
    order?.shipping_address?.line1,
    order?.shipping_address?.line2,
    order?.shipping_address?.city,
    order?.shipping_address?.state,
    order?.shipping_address?.pin,
    getOrderItemNames(order).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(test|trial|preview|codex|dummy|sample)\b/.test(haystack) ||
    ['9999999999', '9876543210'].includes(String(order?.customer_phone || '').replace(/\D/g, ''));
}

function isSettledOrder(order) {
  const paymentStatus = normalizeOrderField(order?.payment_status);
  const paymentMethod = normalizeOrderField(order?.payment_method || order?.shipping_address?.payment_method);
  return paymentStatus === 'paid' || paymentStatus === 'cod' || paymentMethod === 'cod';
}

function isValidOrder(order) {
  return !isCancelledOrder(order) &&
    !isDeletedOrder(order) &&
    !isFailedOrder(order) &&
    !isTestOrder(order) &&
    isSettledOrder(order);
}

function getValidOrders() {
  return allOrders.filter(isValidOrder);
}

function getFilteredOrders() {
  const search = (document.getElementById('order-search')?.value || '').trim().toLowerCase();
  const payment = document.getElementById('payment-filter')?.value || 'all';
  const status = document.getElementById('status-filter')?.value || 'all';
  const date = document.getElementById('date-filter')?.value || 'all';

  return getValidOrders().filter(order => {
    const paymentStatus = normalizeOrderField(order.payment_status);
    const paymentMethod = normalizeOrderField(order.payment_method || order.shipping_address?.payment_method);
    const orderStatus = normalizeOrderField(order.order_status || 'new');
    const matchesSearch = !search || getOrderSearchText(order).includes(search);
    const matchesPayment =
      payment === 'all' ||
      (payment === 'cod' && (paymentStatus === 'cod' || paymentMethod === 'cod')) ||
      (payment !== 'cod' && paymentStatus === payment);
    const matchesStatus = status === 'all' || orderStatus === status;
    const matchesDate = isWithinDateFilter(order, date);
    return matchesSearch && matchesPayment && matchesStatus && matchesDate;
  });
}

function getCustomerKey(order) {
  const phone = String(order.customer_phone || '').replace(/\D/g, '');
  const email = String(order.customer_email || '').trim().toLowerCase();
  return phone || email || `order-${order.id}`;
}

function getOrderCity(order) {
  const addr = order.shipping_address || {};
  return [addr.city, addr.state].filter(Boolean).join(', ');
}

function getOrderItemNames(order) {
  const items = order.shipping_address?.items;
  if (!Array.isArray(items)) return [];
  return items.map(item => item?.name).filter(Boolean);
}

function getCustomerSearchText(customer) {
  return [
    customer.name,
    customer.email,
    customer.phone,
    customer.city,
    customer.topProducts.join(' '),
    customer.orders.map(order => getOrderSearchText(order)).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
}

function buildCustomerProfiles() {
  const map = new Map();

  getValidOrders().forEach(order => {
    const key = getCustomerKey(order);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: order.customer_name || 'Customer',
        email: order.customer_email || '',
        phone: order.customer_phone || '',
        city: getOrderCity(order),
        orders: [],
        orderCount: 0,
        totalSpent: 0,
        paidOrders: 0,
        codOrders: 0,
        firstOrderDate: null,
        lastOrderDate: null,
        topProducts: []
      });
    }

    const customer = map.get(key);
    const created = parseOrderCreatedAt(order.created_at);
    customer.orders.push(order);
    customer.orderCount += 1;
    customer.totalSpent += Number(order.total_amount || 0);
    if (order.payment_status === 'paid') customer.paidOrders += 1;
    if (order.payment_status === 'cod') customer.codOrders += 1;
    if (!customer.name || customer.name === 'Customer') customer.name = order.customer_name || customer.name;
    if (!customer.email) customer.email = order.customer_email || '';
    if (!customer.phone) customer.phone = order.customer_phone || '';
    if (!customer.city) customer.city = getOrderCity(order);
    if (created && (!customer.firstOrderDate || created < customer.firstOrderDate)) customer.firstOrderDate = created;
    if (created && (!customer.lastOrderDate || created > customer.lastOrderDate)) customer.lastOrderDate = created;
  });

  return Array.from(map.values()).map(customer => {
    const productCounts = new Map();
    customer.orders.forEach(order => {
      getOrderItemNames(order).forEach(name => {
        productCounts.set(name, (productCounts.get(name) || 0) + 1);
      });
    });
    customer.topProducts = Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    customer.orders.sort((a, b) => {
      const aDate = parseOrderCreatedAt(a.created_at)?.getTime() || 0;
      const bDate = parseOrderCreatedAt(b.created_at)?.getTime() || 0;
      return bDate - aDate;
    });
    return customer;
  }).sort((a, b) => (b.lastOrderDate?.getTime() || 0) - (a.lastOrderDate?.getTime() || 0));
}

function getFilteredCustomers() {
  const search = (document.getElementById('customer-search')?.value || '').trim().toLowerCase();
  const type = document.getElementById('customer-type-filter')?.value || 'all';
  const date = document.getElementById('customer-date-filter')?.value || 'all';

  return buildCustomerProfiles().filter(customer => {
    const matchesSearch = !search || getCustomerSearchText(customer).includes(search);
    const matchesType =
      type === 'all' ||
      (type === 'repeat' && customer.orderCount > 1) ||
      (type === 'single' && customer.orderCount === 1) ||
      (type === 'paid' && customer.paidOrders > 0) ||
      (type === 'cod' && customer.codOrders > 0);
    const syntheticOrder = { created_at: customer.lastOrderDate?.toISOString() };
    const matchesDate = date === 'all' || isWithinDateFilter(syntheticOrder, date);
    return matchesSearch && matchesType && matchesDate;
  });
}

function formatCustomerDate(date) {
  if (!date) return 'N/A';
  return getOrderDate({ created_at: date.toISOString() });
}

function parseCheckoutDate(value) {
  return parseOrderCreatedAt(value);
}

function getCheckoutDate(checkout) {
  const date = parseCheckoutDate(checkout.updated_at || checkout.created_at);
  if (!date) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
    timeZoneName: 'short'
  });
}

function getCheckoutAddressText(checkout) {
  const addr = checkout.shipping_address || {};
  return [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.pin].filter(Boolean).join(' '),
    addr.country
  ].filter(Boolean).join(', ');
}

function getCheckoutItemNames(checkout) {
  const items = Array.isArray(checkout.cart_items) ? checkout.cart_items : [];
  return items.map(item => item?.name).filter(Boolean);
}

function getAbandonedSearchText(checkout) {
  return [
    checkout.customer_name,
    checkout.customer_email,
    checkout.customer_phone,
    checkout.last_step,
    checkout.payment_method,
    getCheckoutAddressText(checkout),
    getCheckoutItemNames(checkout).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
}

function getFilteredAbandonedCheckouts() {
  const search = (document.getElementById('abandoned-search')?.value || '').trim().toLowerCase();
  const date = document.getElementById('abandoned-date-filter')?.value || 'all';
  const contact = document.getElementById('abandoned-contact-filter')?.value || 'all';

  return allAbandonedCheckouts.filter(checkout => {
    const matchesSearch = !search || getAbandonedSearchText(checkout).includes(search);
    const syntheticOrder = { created_at: checkout.updated_at || checkout.created_at };
    const matchesDate = date === 'all' || isWithinDateFilter(syntheticOrder, date);
    const matchesContact =
      contact === 'all' ||
      (contact === 'phone' && checkout.customer_phone) ||
      (contact === 'email' && checkout.customer_email);
    return matchesSearch && matchesDate && matchesContact;
  });
}

function updateOrderMetrics() {
  const validOrders = getValidOrders();
  const total = validOrders.length;
  const pending = validOrders.filter(order => ['new', 'processing'].includes(normalizeOrderField(order.order_status || 'new'))).length;
  const cod = validOrders.filter(order => {
    const paymentStatus = normalizeOrderField(order.payment_status);
    const paymentMethod = normalizeOrderField(order.payment_method || order.shipping_address?.payment_method);
    return paymentStatus === 'cod' || paymentMethod === 'cod';
  }).length;
  const paidRevenue = validOrders
    .filter(order => normalizeOrderField(order.payment_status) === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('metric-total-orders', String(total));
  setText('metric-pending-orders', String(pending));
  setText('metric-paid-revenue', formatMoney(paidRevenue));
  setText('metric-cod-orders', String(cod));
}

function updateCustomerMetrics() {
  const customers = buildCustomerProfiles();
  const now = new Date();
  const currentMonthKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).format(now);

  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
  const repeatCustomers = customers.filter(customer => customer.orderCount > 1).length;
  const newThisMonth = customers.filter(customer => {
    if (!customer.firstOrderDate) return false;
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: ADMIN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit'
    }).format(customer.firstOrderDate);
    return key === currentMonthKey;
  }).length;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('metric-total-customers', String(customers.length));
  setText('metric-repeat-customers', String(repeatCustomers));
  setText('metric-customer-revenue', formatMoney(totalRevenue));
  setText('metric-new-customers', String(newThisMonth));
}

function updateAbandonedMetrics() {
  const total = allAbandonedCheckouts.length;
  const value = allAbandonedCheckouts.reduce((sum, checkout) => sum + Number(checkout.cart_total || 0), 0);
  const today = allAbandonedCheckouts.filter(checkout => {
    const syntheticOrder = { created_at: checkout.updated_at || checkout.created_at };
    return isWithinDateFilter(syntheticOrder, 'today');
  }).length;
  const withPhone = allAbandonedCheckouts.filter(checkout => checkout.customer_phone).length;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('metric-abandoned-total', String(total));
  setText('metric-abandoned-value', formatMoney(value));
  setText('metric-abandoned-today', String(today));
  setText('metric-abandoned-phone', String(withPhone));
}

function buildWhatsappUrl(order, items) {
  const addr = order.shipping_address || {};
  const phone = normalizeWhatsappPhone(order.customer_phone);
  const addressText = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.pin].filter(Boolean).join(' '),
    addr.country
  ].filter(Boolean).join(', ');
  const message = [
    `Hi ${order.customer_name || ''},`,
    '',
    `Your CaneCreme order #${String(order.id).slice(0, 8).toUpperCase()} is confirmed.`,
    '',
    formatOrderItems(items),
    '',
    `Total: Rs. ${parseFloat(order.total_amount || 0).toFixed(2)}`,
    `Payment: ${order.payment_status || 'pending'}`,
    `Delivery address: ${addressText}`,
    '',
    'Thank you for ordering from CaneCreme.'
  ].join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function callAdminOrders(action, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-orders`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_password: ADMIN_PASSWORD,
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin orders request failed');
  return data;
}

async function callRapidShypOrder(orderId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-rapidshyp-order`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order_id: orderId })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const remarks = data.details?.remarks || data.details?.message || data.error;
    throw new Error(remarks || 'RapidShyp order creation failed');
  }

  return data;
}

async function callOrderEmail(orderId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_password: ADMIN_PASSWORD,
      order_id: orderId,
      email_type: 'order_confirmation'
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details?.message || data.details?.error || data.error;
    throw new Error(details || 'Order email failed');
  }

  return data;
}

async function callAbandonedCheckouts(action, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/abandoned-checkouts`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_password: ADMIN_PASSWORD,
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Abandoned checkouts request failed');
  return data;
}

function setRapidShypResult(message, type = 'info') {
  const resultEl = document.getElementById('rapidshyp-result');
  if (!resultEl) return;

  resultEl.textContent = message || '';
  resultEl.className = `rapidshyp-result ${type ? `rapidshyp-result--${type}` : ''}`;
}

function setEmailResult(message, type = 'info') {
  const resultEl = document.getElementById('email-result');
  if (!resultEl) return;

  resultEl.textContent = message || '';
  resultEl.className = `email-result ${type ? `email-result--${type}` : ''}`;
}

// ===== AUTH =====
function adminLogin() {
  const pwd = document.getElementById('admin-password').value;
  if (pwd === ADMIN_PASSWORD) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    sessionStorage.setItem('admin_auth', 'true');
    loadProducts();
  } else {
    document.getElementById('login-error').style.display = 'block';
  }
}

function adminLogout() {
  stopOrdersAutoRefresh();
  sessionStorage.removeItem('admin_auth');
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('admin_auth') === 'true') {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    loadProducts();
  }

  document.getElementById('admin-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });

  ['order-search', 'payment-filter', 'status-filter', 'date-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'order-search' ? 'input' : 'change', renderOrders);
  });

  ['customer-search', 'customer-type-filter', 'customer-date-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'customer-search' ? 'input' : 'change', renderCustomers);
  });

  ['abandoned-search', 'abandoned-date-filter', 'abandoned-contact-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'abandoned-search' ? 'input' : 'change', renderAbandonedCheckouts);
  });
});

// ===== TABS =====
function showTab(tab) {
  activeAdminTab = tab;
  document.getElementById('tab-products-content').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tab-orders-content').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tab-customers-content').style.display = tab === 'customers' ? 'block' : 'none';
  document.getElementById('tab-abandoned-content').style.display = tab === 'abandoned' ? 'block' : 'none';
  document.getElementById('tab-products').classList.toggle('active', tab === 'products');
  document.getElementById('tab-orders').classList.toggle('active', tab === 'orders');
  document.getElementById('tab-customers').classList.toggle('active', tab === 'customers');
  document.getElementById('tab-abandoned').classList.toggle('active', tab === 'abandoned');
  if (tab === 'orders' || tab === 'customers') {
    loadOrders();
    startOrdersAutoRefresh();
  }
  if (tab === 'abandoned') {
    loadAbandonedCheckouts();
    startOrdersAutoRefresh();
  }
  if (tab === 'products') {
    stopOrdersAutoRefresh();
    loadProducts();
  }
}

// ===== PRODUCTS =====
async function loadProducts() {
  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Loading...</td></tr>';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const products = await res.json();

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#6b6b6b;">No products yet. Add your first product!</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${(p.images && p.images[0]) ? `<img src="${p.images[0]}" alt="${p.name}" />` : '🌿'}</td>
      <td><strong>${p.name}</strong></td>
      <td>₹${parseFloat(p.price).toFixed(2)}</td>
      <td>${p.stock}</td>
      <td><span class="status-badge ${p.is_active ? 'status-paid' : 'status-cancelled'}">${p.is_active ? 'Active' : 'Hidden'}</span></td>
      <td>
        <button class="action-btn edit-product-btn" data-id="${p.id}">Edit</button>
        <button class="action-btn danger" onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      openProductModal(this.getAttribute('data-id'));
    });
  });
}

async function openProductModal(productId) {
  const overlay = document.getElementById('product-modal-overlay');
  document.getElementById('modal-title').textContent = productId ? 'Edit Product' : 'Add Product';
  document.getElementById('product-error').style.display = 'none';
  document.getElementById('p-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-description').value = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-compare-price').value = '';
  document.getElementById('p-stock').value = '';
  document.getElementById('p-image').value = '';
  document.getElementById('p-delivery-type').value = 'pan_india';
  document.getElementById('p-active').checked = true;
  overlay.style.display = 'flex';

  if (!productId) return;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const data = await res.json();
  const product = data[0];
  if (!product) return;

  document.getElementById('p-id').value = product.id;
  document.getElementById('p-name').value = product.name;
  document.getElementById('p-description').value = product.description || '';
  document.getElementById('p-price').value = product.price;
  document.getElementById('p-compare-price').value = product.compare_at_price || '';
  document.getElementById('p-stock').value = product.stock;
  document.getElementById('p-image').value = (product.images || []).join('\n');
  document.getElementById('p-delivery-type').value = product.delivery_type || 'pan_india';
  document.getElementById('p-active').checked = product.is_active;
}

function closeProductModal() {
  document.getElementById('product-modal-overlay').style.display = 'none';
}

async function saveProduct() {
  const id = document.getElementById('p-id').value;
  const name = document.getElementById('p-name').value.trim();
  const price = document.getElementById('p-price').value;
  const stock = document.getElementById('p-stock').value;
  const errorEl = document.getElementById('product-error');

  if (!name || !price || stock === '') {
    errorEl.textContent = 'Name, Price and Stock are required.';
    errorEl.style.display = 'block';
    return;
  }

  const imageLines = document.getElementById('p-image').value.trim();
  const images = imageLines ? imageLines.split('\n').map(s => s.trim()).filter(s => s.length > 0) : [];
  const payload = {
    name,
    description: document.getElementById('p-description').value.trim(),
    price: parseFloat(price),
    compare_at_price: document.getElementById('p-compare-price').value ? parseFloat(document.getElementById('p-compare-price').value) : null,
    stock: parseInt(stock),
    images,
    delivery_type: document.getElementById('p-delivery-type').value,
    is_active: document.getElementById('p-active').checked
  };

  const url = id
    ? `${SUPABASE_URL}/rest/v1/products?id=eq.${id}`
    : `${SUPABASE_URL}/rest/v1/products`;

  const saveWithPayload = (bodyPayload) => fetch(url, {
    method: id ? 'PATCH' : 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(bodyPayload)
  });

  let res = await saveWithPayload(payload);
  let errorDetails = null;

  if (!res.ok) {
    errorDetails = await res.json().catch(async () => ({ message: await res.text() }));
    const schemaMessage = `${errorDetails.message || ''} ${errorDetails.details || ''} ${errorDetails.hint || ''}`;
    if (/delivery_type|schema cache|column/i.test(schemaMessage)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.delivery_type;
      res = await saveWithPayload(fallbackPayload);
      if (!res.ok) {
        errorDetails = await res.json().catch(async () => ({ message: await res.text() }));
      } else {
        errorDetails = null;
      }
    }
  }

  if (res.ok) {
    closeProductModal();
    loadProducts();
  } else {
    console.error('Product save failed:', errorDetails);
    errorEl.textContent = errorDetails?.message
      ? `Error saving product: ${errorDetails.message}`
      : 'Error saving product. Please try again.';
    errorEl.style.display = 'block';
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;

  await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });

  loadProducts();
}

// ===== ORDERS =====
async function loadOrders() {
  if (ordersLoading) return;
  ordersLoading = true;
  const tbody = document.getElementById('orders-table-body');
  if (allOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Loading...</td></tr>';
  }

  try {
    const data = await callAdminOrders('list');
    allOrders = Array.isArray(data.orders) ? data.orders : [];
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#dc2626;">${error.message}</td></tr>`;
    ordersLoading = false;
    return;
  }

  updateOrderMetrics();
  updateCustomerMetrics();
  renderOrders();
  renderCustomers();
  updateOrdersRefreshNote();
  updateCustomersRefreshNote();
  ordersLoading = false;
}

function updateOrdersRefreshNote() {
  const el = document.getElementById('orders-refresh-note');
  if (!el) return;
  const time = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  });
  el.textContent = `Auto-refresh: 10 sec · IST · Updated ${time}`;
}

function updateCustomersRefreshNote() {
  const el = document.getElementById('customers-refresh-note');
  if (!el) return;
  const time = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  });
  el.textContent = `Uses order history · Updated ${time}`;
}

function startOrdersAutoRefresh() {
  stopOrdersAutoRefresh();
  ordersRefreshTimer = window.setInterval(() => {
    if ((activeAdminTab === 'orders' || activeAdminTab === 'customers') && !document.hidden) {
      loadOrders();
    }
    if (activeAdminTab === 'abandoned' && !document.hidden) {
      loadAbandonedCheckouts();
    }
  }, ORDERS_REFRESH_MS);
}

function stopOrdersAutoRefresh() {
  if (!ordersRefreshTimer) return;
  window.clearInterval(ordersRefreshTimer);
  ordersRefreshTimer = null;
}

function renderOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  const orders = getFilteredOrders();

  if (getValidOrders().length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b6b6b;">No orders yet.</td></tr>';
    return;
  }

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b6b6b;">No orders match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>
        <button class="order-id-button" type="button" onclick="openOrderModal('${o.id}')">
          ${escapeHtml(getShortOrderId(o))}
        </button>
      </td>
      <td>
        <strong>${escapeHtml(o.customer_name || 'Customer')}</strong>
        <small>${escapeHtml(o.customer_email || 'No email')}</small>
      </td>
      <td>${escapeHtml(o.customer_phone || 'N/A')}</td>
      <td><strong>${formatMoney(o.total_amount)}</strong></td>
      <td><span class="status-badge status-${escapeHtml(o.payment_status || 'pending')}">${escapeHtml(o.payment_status || 'pending')}</span></td>
      <td><span class="status-badge status-${escapeHtml(o.order_status || 'new')}">${escapeHtml(o.order_status || 'new')}</span></td>
      <td>${escapeHtml(getOrderDate(o))}</td>
      <td><button class="action-btn" onclick="openOrderModal('${o.id}')">View</button></td>
    </tr>
  `).join('');
}

async function loadAbandonedCheckouts() {
  if (abandonedLoading) return;
  abandonedLoading = true;
  const tbody = document.getElementById('abandoned-table-body');
  if (tbody && allAbandonedCheckouts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading...</td></tr>';
  }

  try {
    const data = await callAbandonedCheckouts('list');
    allAbandonedCheckouts = Array.isArray(data.checkouts) ? data.checkouts : [];
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#dc2626;">${escapeHtml(error.message)}</td></tr>`;
    }
    abandonedLoading = false;
    return;
  }

  updateAbandonedMetrics();
  renderAbandonedCheckouts();
  updateAbandonedRefreshNote();
  abandonedLoading = false;
}

function updateAbandonedRefreshNote() {
  const el = document.getElementById('abandoned-refresh-note');
  if (!el) return;
  const time = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  });
  el.textContent = `Auto-refresh: 10 sec · IST · Updated ${time}`;
}

function buildAbandonedWhatsappUrl(checkout) {
  const phone = normalizeWhatsappPhone(checkout.customer_phone);
  if (!phone) return '';
  const items = getCheckoutItemNames(checkout).slice(0, 4).join(', ') || 'your CaneCreme cart';
  const message = [
    `Hi ${checkout.customer_name || ''},`,
    '',
    `You left ${items} in your CaneCreme checkout.`,
    `Cart total: ${formatMoney(checkout.cart_total)}`,
    '',
    'Would you like help completing your order?'
  ].join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderAbandonedCheckouts() {
  const tbody = document.getElementById('abandoned-table-body');
  if (!tbody) return;

  const checkouts = getFilteredAbandonedCheckouts();

  if (allAbandonedCheckouts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No abandoned checkouts yet.</td></tr>';
    return;
  }

  if (checkouts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No abandoned checkouts match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = checkouts.map(checkout => {
    const items = getCheckoutItemNames(checkout);
    const address = getCheckoutAddressText(checkout);
    const whatsappUrl = buildAbandonedWhatsappUrl(checkout);
    const lastStep = String(checkout.last_step || 'checkout_started').replace(/_/g, ' ');

    return `
      <tr>
        <td>
          <strong>${escapeHtml(checkout.customer_name || 'Checkout visitor')}</strong>
          <small>${escapeHtml(address || 'Address not completed')}</small>
        </td>
        <td>
          ${escapeHtml(checkout.customer_phone || 'No phone')}
          <small>${escapeHtml(checkout.customer_email || 'No email')}</small>
        </td>
        <td><strong>${formatMoney(checkout.cart_total)}</strong><small>${escapeHtml(checkout.payment_method || 'Payment not selected')}</small></td>
        <td><span class="status-badge status-pending">${escapeHtml(lastStep)}</span></td>
        <td>${escapeHtml(getCheckoutDate(checkout))}</td>
        <td>${escapeHtml(items.join(', ') || 'Cart details saved')}</td>
        <td class="abandoned-actions">
          ${whatsappUrl ? `<a class="action-btn abandoned-whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button class="action-btn" onclick="closeAbandonedCheckout('${checkout.id}')">Close</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function closeAbandonedCheckout(checkoutId) {
  if (!confirm('Close this abandoned checkout after follow-up?')) return;
  await callAbandonedCheckouts('complete', { checkout_id: checkoutId });
  allAbandonedCheckouts = allAbandonedCheckouts.filter(checkout => checkout.id !== checkoutId);
  updateAbandonedMetrics();
  renderAbandonedCheckouts();
}

function renderCustomers() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  const customers = getFilteredCustomers();

  if (getValidOrders().length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No customer activity yet. Customers appear here after orders are placed.</td></tr>';
    return;
  }

  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No customers match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(customer => {
    const lastOrder = customer.orders[0];
    const activity = customer.topProducts.length
      ? customer.topProducts.join(', ')
      : `${escapeHtml(lastOrder?.order_status || 'new')} order`;
    const typeLabel = customer.orderCount > 1 ? 'Repeat' : 'First order';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(customer.name || 'Customer')}</strong>
          <small>${escapeHtml(typeLabel)} · First seen ${escapeHtml(formatCustomerDate(customer.firstOrderDate))}</small>
        </td>
        <td>
          ${escapeHtml(customer.phone || 'No phone')}
          <small>${escapeHtml(customer.email || 'No email')}${customer.city ? ` · ${escapeHtml(customer.city)}` : ''}</small>
        </td>
        <td><strong>${customer.orderCount}</strong><small>${customer.paidOrders} paid · ${customer.codOrders} COD</small></td>
        <td><strong>${formatMoney(customer.totalSpent)}</strong></td>
        <td>${escapeHtml(formatCustomerDate(customer.lastOrderDate))}</td>
        <td>${escapeHtml(activity)}</td>
        <td><button class="action-btn" onclick="openCustomerModal('${encodeURIComponent(customer.key)}')">View</button></td>
      </tr>
    `;
  }).join('');
}

function renderCustomerTimeline(customer) {
  return customer.orders.map(order => `
    <div class="customer-timeline-item">
      <div class="customer-timeline-dot"></div>
      <div class="customer-timeline-card">
        <div class="customer-timeline-head">
          <button class="order-id-button" type="button" onclick="openOrderModal('${order.id}')">${escapeHtml(getShortOrderId(order))}</button>
          <span>${escapeHtml(getOrderDate(order))}</span>
        </div>
        <div class="customer-timeline-meta">
          <span class="status-badge status-${escapeHtml(order.payment_status || 'pending')}">${escapeHtml(order.payment_status || 'pending')}</span>
          <span class="status-badge status-${escapeHtml(order.order_status || 'new')}">${escapeHtml(order.order_status || 'new')}</span>
          <strong>${formatMoney(order.total_amount)}</strong>
        </div>
        <p>${escapeHtml(getOrderItemNames(order).join(', ') || 'Order details available from View Order')}</p>
      </div>
    </div>
  `).join('');
}

function openCustomerModal(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  const customer = buildCustomerProfiles().find(profile => profile.key === key);
  if (!customer) {
    alert('Customer not found.');
    return;
  }

  const lastOrder = customer.orders[0] || {};
  const whatsappPhone = normalizeWhatsappPhone(customer.phone);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hi ${customer.name || ''}, thank you for ordering from CaneCreme.`)}`
    : '';

  document.getElementById('customer-detail-content').innerHTML = `
    <div class="customer-profile-card">
      <div>
        <span>Customer</span>
        <h4>${escapeHtml(customer.name || 'Customer')}</h4>
        <p>${escapeHtml(customer.phone || 'No phone')}<br/>${escapeHtml(customer.email || 'No email')}<br/>${escapeHtml(customer.city || getOrderCity(lastOrder) || 'No city saved')}</p>
      </div>
      <div class="customer-profile-actions">
        ${whatsappUrl ? `<a class="whatsapp-order-btn" href="${whatsappUrl}" target="_blank" rel="noopener">Message on WhatsApp</a>` : ''}
      </div>
    </div>
    <div class="order-summary-strip">
      <div><span>Total Orders</span><strong>${customer.orderCount}</strong></div>
      <div><span>Total Spent</span><strong>${formatMoney(customer.totalSpent)}</strong></div>
      <div><span>First Seen</span><strong>${escapeHtml(formatCustomerDate(customer.firstOrderDate))}</strong></div>
      <div><span>Last Activity</span><strong>${escapeHtml(formatCustomerDate(customer.lastOrderDate))}</strong></div>
    </div>
    <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;margin:1.25rem 0 0.75rem;font-weight:600;">Order Timeline</h4>
    <div class="customer-timeline">
      ${renderCustomerTimeline(customer)}
    </div>
  `;

  document.getElementById('customer-modal-overlay').style.display = 'flex';
}

function closeCustomerModal() {
  document.getElementById('customer-modal-overlay').style.display = 'none';
}

async function openOrderModal(orderId) {
  currentOrderId = orderId;
  setRapidShypResult('');
  setEmailResult('');

  const data = await callAdminOrders('detail', { order_id: orderId });
  const order = data.order;
  const items = Array.isArray(data.items) ? data.items : [];
  if (!order) {
    alert('Order not found.');
    return;
  }
  const addr = order.shipping_address || {};
  const whatsappUrl = buildWhatsappUrl(order, items);
  const phoneText = order.customer_phone || '';
  const deliveryCharge = Number(addr.delivery_charge || order.delivery_charge || 0);
  const paymentMethod = addr.payment_method || order.payment_method || order.payment_status || 'N/A';

  document.getElementById('order-status-select').value = order.order_status || 'new';

  document.getElementById('order-detail-content').innerHTML = `
    <div class="order-id-panel">
      <div>
        <span>Order ID</span>
        <code>${escapeHtml(order.id)}</code>
      </div>
      <strong>${escapeHtml(getShortOrderId(order))}</strong>
    </div>
    <div class="order-summary-strip">
      <div><span>Total</span><strong>${formatMoney(order.total_amount)}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(order.payment_status || 'pending')}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(order.order_status || 'new')}</strong></div>
      <div><span>Created</span><strong>${escapeHtml(getOrderDate(order))}</strong></div>
    </div>
    <div class="order-detail-grid">
      <div class="order-detail-section">
        <h4>Customer</h4>
        <p>${escapeHtml(order.customer_name)}<br/>${escapeHtml(order.customer_email)}<br/>${escapeHtml(phoneText)}</p>
        ${phoneText ? `<a class="whatsapp-order-btn" href="${whatsappUrl}" target="_blank" rel="noopener">Open WhatsApp Order</a>` : ''}
      </div>
      <div class="order-detail-section">
        <h4>Shipping Address</h4>
        <p>${escapeHtml(addr.line1)}${addr.line2 ? ', ' + escapeHtml(addr.line2) : ''}<br/>${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} ${escapeHtml(addr.pin)}<br/>${escapeHtml(addr.country)}</p>
      </div>
      <div class="order-detail-section">
        <h4>Payment</h4>
        <p>Method: ${escapeHtml(paymentMethod)}<br/>Status: ${escapeHtml(order.payment_status)}<br/>ID: ${escapeHtml(order.payment_id || 'N/A')}</p>
      </div>
      <div class="order-detail-section">
        <h4>Delivery</h4>
        <p>Partner: ${escapeHtml(order.shipping_partner || 'RapidShyp')}<br/>Charge: ${formatMoney(deliveryCharge)}<br/>AWB: ${escapeHtml(order.shipping_awb || 'Not assigned')}</p>
      </div>
    </div>
    <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;margin-bottom:0.75rem;font-weight:600;">Items Ordered</h4>
    <table class="order-items-table">
      <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${renderOrderItemRows(items)}
      </tbody>
    </table>
  `;

  document.getElementById('order-modal-overlay').style.display = 'flex';
}

function closeOrderModal() {
  document.getElementById('order-modal-overlay').style.display = 'none';
}

async function updateOrderStatus() {
  const status = document.getElementById('order-status-select').value;
  await callAdminOrders('update_status', { order_id: currentOrderId, order_status: status });
  closeOrderModal();
  loadOrders();
}

async function sendCurrentOrderEmail() {
  if (!currentOrderId) {
    setEmailResult('Open an order first.', 'error');
    return;
  }

  const btn = document.getElementById('send-email-btn');
  const originalText = btn ? btn.textContent : '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
  }
  setEmailResult('Sending order email...', 'info');

  try {
    const data = await callOrderEmail(currentOrderId);
    setEmailResult(`Email sent successfully${data.email_id ? ` (${data.email_id})` : ''}.`, 'success');
  } catch (error) {
    setEmailResult(error instanceof Error ? error.message : 'Email could not be sent.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Send Email';
    }
  }
}

async function pushCurrentOrderToRapidShyp() {
  if (!currentOrderId) {
    setRapidShypResult('Open an order first.', 'error');
    return;
  }

  const btn = document.getElementById('rapidshyp-push-btn');
  const originalText = btn ? btn.textContent : '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Pushing...';
  }
  setRapidShypResult('Sending order to RapidShyp...', 'info');

  try {
    const data = await callRapidShypOrder(currentOrderId);
    const rapidshypId = data.rapidshyp_order_id || data.rapidshyp?.order_id || data.rapidshyp?.orderId;
    setRapidShypResult(
      rapidshypId ? `Pushed to RapidShyp. ID: ${rapidshypId}` : 'Pushed to RapidShyp successfully.',
      'success'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RapidShyp push failed.';
    const alreadyExists = /already exists/i.test(message);
    setRapidShypResult(
      alreadyExists ? 'Already pushed to RapidShyp. Search this order ID in RapidShyp.' : message,
      alreadyExists ? 'success' : 'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Push to RapidShyp';
    }
  }
}
