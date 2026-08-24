// ===== ADMIN PANEL =====

let currentOrderId = null;
let allProducts = [];
let allOrders = [];
let allAbandonedCheckouts = [];
let allLeads = [];
let allAdminUsers = [];
let allAdminInvites = [];
let allAdminRolePermissions = [];
let activeAdminTab = 'dashboard';
let ordersRefreshTimer = null;
let ordersLoading = false;
let abandonedLoading = false;
let leadsLoading = false;
let adminUsersLoading = false;
let activityLogs = [];

const ADMIN_TIME_ZONE = 'Asia/Kolkata';
const ORDERS_REFRESH_MS = 10000;
const ACTIVITY_LOG_KEY = 'canecreme_admin_activity_log';
const ADMIN_SETTINGS_KEY = 'canecreme_admin_settings';
const ADMIN_SESSION_KEY = 'canecreme_admin_session';
const ADMIN_USER_KEY = 'canecreme_admin_user';
const CONTENT_DRAFTS_KEY = 'canecreme_admin_content_drafts';

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getLowStockProducts() {
  return allProducts.filter(product => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5);
}

function getOutOfStockProducts() {
  return allProducts.filter(product => Number(product.stock || 0) <= 0);
}

function getProductStockClass(product) {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return 'stock-chip-out';
  if (stock <= 5) return 'stock-chip-low';
  return 'stock-chip-ok';
}

function getProductStockLabel(product) {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return 'Out';
  if (stock <= 5) return `Low (${stock})`;
  return String(stock);
}

function getDeliveryLabel(deliveryType) {
  return deliveryType === 'delhi_only' ? 'Delhi Only' : 'Pan India';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    alert('Nothing to export yet.');
    return;
  }

  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadActivityLogs() {
  try {
    activityLogs = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
  } catch (error) {
    activityLogs = [];
  }
}

function recordActivity(action, detail = '') {
  loadActivityLogs();
  activityLogs.unshift({
    action,
    detail,
    at: new Date().toISOString()
  });
  activityLogs = activityLogs.slice(0, 100);
  localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activityLogs));
  renderActivityLogs();
}

function renderActivityLogs() {
  const el = document.getElementById('activity-log-list');
  updateBackupMetrics();
  if (!el) return;
  loadActivityLogs();
  if (!activityLogs.length) {
    el.innerHTML = '<div class="dashboard-list-empty">No local admin activity has been recorded yet.</div>';
    return;
  }
  el.innerHTML = activityLogs.slice(0, 12).map(log => `
    <div class="dashboard-list-item">
      <div>
        <strong>${escapeHtml(log.action)}</strong>
        <small>${escapeHtml(log.detail || 'Admin action')} - ${escapeHtml(getOrderDate({ created_at: log.at }))}</small>
      </div>
    </div>
  `).join('');
}

function updateBackupMetrics() {
  setText('backup-products-count', String(allProducts.length));
  setText('backup-orders-count', String(getValidOrders().length));
  setText('backup-customers-count', String(buildCustomerProfiles().length));
  loadActivityLogs();
  setText('backup-activity-count', String(activityLogs.length));
}

function exportActivityLogs() {
  loadActivityLogs();
  if (!activityLogs.length) {
    recordActivity('Opened Security & Backup', 'Created first local activity log entry');
  }
  downloadCsv(`canecreme-activity-${getIndiaDateKey(new Date())}.csv`, [
    ['action', 'detail', 'created_at'],
    ...activityLogs.map(log => [log.action, log.detail || '', log.at])
  ]);
  recordActivity('Exported activity logs', 'Downloaded local admin activity CSV');
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

function isCancelledOrder(order) {
  return normalizeOrderField(order?.order_status) === 'cancelled';
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

function getCheckoutItemsSummary(checkout) {
  const items = Array.isArray(checkout.cart_items) ? checkout.cart_items : [];
  return items.map(item => {
    const qty = Number(item.quantity || 0);
    return `${item.name || 'Item'}${qty ? ` x ${qty}` : ''}`;
  }).filter(Boolean);
}

function getRecoveryStatus(checkout) {
  if (checkout.recovery_offer?.status === 'expired') return 'expired';
  return checkout.recovery_status || (checkout.recovery_offer ? checkout.recovery_offer.status : 'not_contacted') || 'not_contacted';
}

function getRecoveryStatusLabel(status) {
  const labels = {
    not_contacted: 'Not Contacted',
    offer_created: 'Offer Created',
    whatsapp_opened: 'WhatsApp Opened',
    contacted: 'Contacted',
    recovered: 'Recovered',
    expired: 'Expired'
  };
  return labels[status] || 'Not Contacted';
}

function getRecoveryStatusClass(status) {
  if (status === 'recovered') return 'status-paid';
  if (status === 'expired') return 'status-cancelled';
  if (status === 'contacted' || status === 'whatsapp_opened') return 'status-processing';
  if (status === 'offer_created') return 'status-cod';
  return 'status-pending';
}

function getRecoveryLink(checkout) {
  return checkout.checkout_link || checkout.recovery_offer?.checkout_link || `https://www.canecreme.co/checkout.html?recover=${encodeURIComponent(checkout.id)}`;
}

function getAbandonedSearchText(checkout) {
  return [
    checkout.id,
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
  const status = document.getElementById('abandoned-status-filter')?.value || 'all';

  return allAbandonedCheckouts.filter(checkout => {
    const matchesSearch = !search || getAbandonedSearchText(checkout).includes(search);
    const syntheticOrder = { created_at: checkout.updated_at || checkout.created_at };
    const matchesDate = date === 'all' || isWithinDateFilter(syntheticOrder, date);
    const matchesContact =
      contact === 'all' ||
      (contact === 'phone' && checkout.customer_phone) ||
      (contact === 'email' && checkout.customer_email);
    const checkoutStatus = getRecoveryStatus(checkout);
    const matchesStatus =
      status === 'all' ||
      checkoutStatus === status ||
      (status === 'contacted' && checkoutStatus === 'whatsapp_opened');
    return matchesSearch && matchesDate && matchesContact && matchesStatus;
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
  const cancelled = allOrders.filter(isCancelledOrder).length;
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
  setText('metric-cancelled-orders', String(cancelled));
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
  const offersSent = allAbandonedCheckouts.filter(checkout => checkout.recovery_offer).length;
  const recovered = allAbandonedCheckouts.filter(checkout => getRecoveryStatus(checkout) === 'recovered').length;
  const recoveredRevenue = allAbandonedCheckouts
    .filter(checkout => getRecoveryStatus(checkout) === 'recovered')
    .reduce((sum, checkout) => sum + Number(checkout.cart_total || 0), 0);
  const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('metric-abandoned-total', String(total));
  setText('metric-abandoned-value', formatMoney(value));
  setText('metric-abandoned-offers', String(offersSent));
  setText('metric-abandoned-recovered', String(recovered));
  setText('metric-abandoned-revenue', formatMoney(recoveredRevenue));
  setText('metric-abandoned-rate', `${recoveryRate}%`);
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

function getAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
}

function getCurrentAdminUser() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_USER_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function isOwnerSession() {
  return getCurrentAdminUser()?.role === 'owner';
}

function setCurrentAdminUser(user) {
  if (user) {
    sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(ADMIN_USER_KEY);
  }
  applyAdminAccessControls();
}

function applyAdminAccessControls() {
  const isOwner = isOwnerSession();
  document.querySelectorAll('.owner-only').forEach(el => {
    el.classList.toggle('is-hidden', !isOwner);
  });
  if (!isOwner && activeAdminTab === 'users') {
    showTab('dashboard');
  }
}

function requireAdminSession() {
  const session = getAdminSession();
  if (!session) {
    adminLogout();
    throw new Error('Admin session expired. Please log in again.');
  }
  return session;
}

async function callAdminAuth(credentials) {
  const authBody = typeof credentials === 'string'
    ? { admin_password: credentials }
    : credentials;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-auth`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'login',
      ...authBody
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin login failed');
  return data;
}

async function callAcceptAdminInvite(inviteToken, fullName, password) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_session: requireAdminSession(),
      action: 'accept_invite',
      invite_token: inviteToken,
      full_name: fullName,
      password
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Invite could not be accepted');
  return data;
}

function completeAdminLogin(data, fallbackActivity) {
  if (!data.admin_session) throw new Error('Admin session was not returned');
  sessionStorage.setItem(ADMIN_SESSION_KEY, data.admin_session);
  setCurrentAdminUser(data.user || null);
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('admin-dashboard').style.display = 'block';
  recordActivity(fallbackActivity.title, fallbackActivity.detail);
  loadAdminSettings();
  refreshDashboard();
  startOrdersAutoRefresh();
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
      admin_session: requireAdminSession(),
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
    body: JSON.stringify({
      admin_session: requireAdminSession(),
      order_id: orderId
    })
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
      admin_session: requireAdminSession(),
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
      admin_session: requireAdminSession(),
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Abandoned checkouts request failed');
  return data;
}

async function callAdminLeads(action, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-leads`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_session: requireAdminSession(),
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Popup leads request failed');
  return data;
}

async function callAdminProducts(action, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-products`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_session: requireAdminSession(),
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin products request failed');
  return data;
}

async function callAdminUsers(action, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      admin_session: requireAdminSession(),
      action,
      ...extra
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin users request failed');
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
async function adminLogin() {
  const pwd = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.className = 'error-msg';
  errorEl.style.display = 'none';

  try {
    const data = await callAdminAuth(pwd);
    completeAdminLogin(data, { title: 'Admin login', detail: 'Owner session started' });
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Incorrect password';
    errorEl.style.display = 'block';
  }
}

async function adminStaffLogin() {
  const email = document.getElementById('admin-email')?.value || '';
  const password = document.getElementById('admin-staff-password')?.value || '';
  const errorEl = document.getElementById('login-error');
  errorEl.className = 'error-msg';
  errorEl.style.display = 'none';

  try {
    const data = await callAdminAuth({ email, password });
    completeAdminLogin(data, { title: 'Staff login', detail: data.user?.email || email });
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Staff login failed';
    errorEl.style.display = 'block';
  }
}

async function acceptAdminInvite() {
  const inviteToken = document.getElementById('invite-token')?.value || '';
  const fullName = document.getElementById('invite-full-name')?.value || '';
  const password = document.getElementById('invite-password')?.value || '';
  const errorEl = document.getElementById('invite-status') || document.getElementById('login-error');
  errorEl.style.display = 'none';

  try {
    if (!isOwnerSession()) throw new Error('Only the owner can accept invite tokens');
    if (!inviteToken.trim()) throw new Error('Invite token is required');
    if (password.length < 10) throw new Error('Password must be at least 10 characters');
    await callAcceptAdminInvite(inviteToken.trim(), fullName.trim(), password);
    ['invite-token', 'invite-full-name', 'invite-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    await loadAdminUsers();
    errorEl.textContent = 'Staff access created. The token has been consumed and cannot be reused.';
    errorEl.className = 'success-msg';
    errorEl.style.display = 'block';
  } catch (error) {
    errorEl.className = 'error-msg';
    errorEl.textContent = error instanceof Error ? error.message : 'Invite could not be accepted';
    errorEl.style.display = 'block';
  }
}

function adminLogout() {
  stopOrdersAutoRefresh();
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_USER_KEY);
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  applyAdminAccessControls();
  if (getAdminSession()) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    applyAdminAccessControls();
    loadAdminSettings();
    renderActivityLogs();
    refreshDashboard();
    startOrdersAutoRefresh();
  }

  document.getElementById('admin-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });

  ['admin-email', 'admin-staff-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') adminStaffLogin();
    });
  });

  ['invite-token', 'invite-full-name', 'invite-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') acceptAdminInvite();
    });
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

  ['abandoned-search', 'abandoned-date-filter', 'abandoned-contact-filter', 'abandoned-status-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'abandoned-search' ? 'input' : 'change', renderAbandonedCheckouts);
  });

  document.querySelectorAll('.recovery-offer-choice').forEach(button => {
    button.addEventListener('click', () => createRecoveryOffer(button.dataset.offer));
  });

  ['lead-search', 'lead-date-filter', 'lead-contact-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'lead-search' ? 'input' : 'change', renderLeads);
  });

  ['discount-search', 'discount-status-filter', 'discount-type-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'discount-search' ? 'input' : 'change', renderDiscounts);
  });

  ['product-search', 'product-status-filter', 'stock-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'product-search' ? 'input' : 'change', renderProducts);
  });

  ['user-search', 'user-role-filter', 'user-status-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'user-search' ? 'input' : 'change', renderUserManagement);
  });

  document.getElementById('admin-global-search')?.addEventListener('input', event => {
    const targetMap = {
      products: ['product-search', renderProducts],
      orders: ['order-search', renderOrders],
      abandoned: ['abandoned-search', renderAbandonedCheckouts],
      leads: ['lead-search', renderLeads],
      discounts: ['discount-search', renderDiscounts],
      users: ['user-search', renderUserManagement]
    };
    const target = targetMap[activeAdminTab];
    if (!target) return;
    const input = document.getElementById(target[0]);
    if (!input) return;
    input.value = event.target.value;
    if (activeAdminTab === 'orders') {
      const customerInput = document.getElementById('customer-search');
      if (customerInput) customerInput.value = event.target.value;
      renderCustomers();
    }
    target[1]();
  });
});

// ===== TABS =====
function showTab(tab) {
  if (!getAdminSession()) {
    adminLogout();
    return;
  }
  if (tab === 'users' && !isOwnerSession()) {
    alert('Only the owner can manage users and invite tokens.');
    tab = 'dashboard';
  }
  activeAdminTab = tab;
  updateAdminTopbar(tab);
  document.getElementById('tab-dashboard-content').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('tab-products-content').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tab-orders-content').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tab-abandoned-content').style.display = tab === 'abandoned' ? 'block' : 'none';
  document.getElementById('tab-leads-content').style.display = tab === 'leads' ? 'block' : 'none';
  document.getElementById('tab-discounts-content').style.display = tab === 'discounts' ? 'block' : 'none';
  document.getElementById('tab-users-content').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('tab-content-content').style.display = tab === 'content' ? 'block' : 'none';
  document.getElementById('tab-reports-content').style.display = tab === 'reports' ? 'block' : 'none';
  document.getElementById('tab-settings-content').style.display = tab === 'settings' ? 'block' : 'none';
  document.getElementById('tab-security-content').style.display = tab === 'security' ? 'block' : 'none';
  document.getElementById('tab-dashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tab-products').classList.toggle('active', tab === 'products');
  document.getElementById('tab-orders').classList.toggle('active', tab === 'orders');
  document.getElementById('tab-abandoned').classList.toggle('active', tab === 'abandoned');
  document.getElementById('tab-leads').classList.toggle('active', tab === 'leads');
  document.getElementById('tab-discounts').classList.toggle('active', tab === 'discounts');
  document.getElementById('tab-users').classList.toggle('active', tab === 'users');
  document.getElementById('tab-content').classList.toggle('active', tab === 'content');
  document.getElementById('tab-reports').classList.toggle('active', tab === 'reports');
  document.getElementById('tab-settings').classList.toggle('active', tab === 'settings');
  document.getElementById('tab-security').classList.toggle('active', tab === 'security');
  if (tab === 'dashboard') {
    refreshDashboard();
    startOrdersAutoRefresh();
  }
  if (tab === 'orders') {
    loadOrders();
    startOrdersAutoRefresh();
  }
  if (tab === 'abandoned') {
    loadAbandonedCheckouts();
    startOrdersAutoRefresh();
  }
  if (tab === 'leads') {
    loadLeads();
    startOrdersAutoRefresh();
  }
  if (tab === 'discounts') {
    loadDiscountSources();
  }
  if (tab === 'products') {
    loadProducts();
  }
  if (tab === 'users') {
    loadAdminUsers();
  }
  if (tab === 'reports') {
    loadOrders();
  }
  if (tab === 'content') {
    renderContentTools();
  }
  if (tab === 'settings') {
    loadAdminSettings();
  }
  if (tab === 'security') {
    recordActivity('Opened Security & Backup', 'Viewed security checklist and backup tools');
    updateBackupMetrics();
    renderActivityLogs();
  }
}

function updateAdminTopbar(tab) {
  const labels = {
    dashboard: ['Business Dashboard', 'Live operations workspace'],
    orders: ['Order & Customer Management', 'Payments, fulfilment, and customer activity'],
    products: ['Products', 'Catalogue, pricing, and inventory'],
    abandoned: ['Abandoned Checkouts', 'Recovery queue and offers'],
    leads: ['Popup Leads', 'WELCOME10 lead capture'],
    discounts: ['Discounts', 'Codes, recovery offers, and usage'],
    users: ['User Management', 'Admin access and roles'],
    content: ['Content Management', 'Website content workspace'],
    reports: ['Reports', 'Sales and recovery analytics'],
    settings: ['General Settings', 'Store configuration reference'],
    security: ['Security & Backup', 'Admin safety and exports']
  };
  const [title, subtitle] = labels[tab] || labels.dashboard;
  setText('admin-current-title', title);
  setText('admin-current-subtitle', subtitle);
}

// ===== PRODUCTS =====
async function loadProducts() {
  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Loading...</td></tr>';

  const data = await callAdminProducts('list');
  const products = Array.isArray(data.products) ? data.products : [];

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

  const data = await callAdminProducts('detail', { product_id: productId });
  const product = data.product;
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

  try {
    await callAdminProducts('save', {
      product_id: id || undefined,
      product: { id: id || undefined, ...payload }
    });
    closeProductModal();
    loadProducts();
  } catch (error) {
    console.error('Product save failed:', error);
    errorEl.textContent = error instanceof Error
      ? `Error saving product: ${error.message}`
      : 'Error saving product. Please try again.';
    errorEl.style.display = 'block';
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;

  await callAdminProducts('delete', { product_id: id });

  loadProducts();
}

async function toggleProductActive(id) {
  const product = allProducts.find(item => item.id === id);
  if (!product) return;

  await callAdminProducts('toggle_active', {
    product_id: id,
    product: { is_active: !product.is_active }
  });

  loadProducts();
}

async function loadProducts() {
  const tbody = document.getElementById('products-table-body');
  if (tbody && allProducts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading...</td></tr>';
  }

  try {
    const data = await callAdminProducts('list');
    allProducts = Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#dc2626;">${escapeHtml(error.message || 'Products could not be loaded.')}</td></tr>`;
    }
    return;
  }

  updateProductMetrics();
  renderProducts();
  renderDashboard();
}

function updateProductMetrics() {
  const active = allProducts.filter(product => product.is_active).length;
  const stockAlerts = getLowStockProducts().length + getOutOfStockProducts().length;
  const inventoryValue = allProducts.reduce((sum, product) => {
    return sum + (Number(product.price || 0) * Math.max(Number(product.stock || 0), 0));
  }, 0);

  setText('metric-total-products', String(allProducts.length));
  setText('metric-active-products', String(active));
  setText('metric-products-low-stock', String(stockAlerts));
  setText('metric-inventory-value', formatMoney(inventoryValue));
  setText('metric-low-stock', String(stockAlerts));
}

function getProductSearchText(product) {
  return [
    product.name,
    product.description,
    product.price,
    product.stock,
    getDeliveryLabel(product.delivery_type),
    (product.images || []).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
}

function getFilteredProducts() {
  const search = (document.getElementById('product-search')?.value || '').trim().toLowerCase();
  const status = document.getElementById('product-status-filter')?.value || 'all';
  const stockFilter = document.getElementById('stock-filter')?.value || 'all';

  return allProducts.filter(product => {
    const stock = Number(product.stock || 0);
    const matchesSearch = !search || getProductSearchText(product).includes(search);
    const matchesStatus =
      status === 'all' ||
      (status === 'active' && product.is_active) ||
      (status === 'hidden' && !product.is_active);
    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'low' && stock > 0 && stock <= 5) ||
      (stockFilter === 'out' && stock <= 0) ||
      (stockFilter === 'available' && stock > 5);
    return matchesSearch && matchesStatus && matchesStock;
  });
}

function renderProducts() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  const products = getFilteredProducts();

  if (allProducts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No products yet. Add your first product!</td></tr>';
    return;
  }

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No products match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${(p.images && p.images[0]) ? `<img src="${escapeHtml(p.images[0])}" alt="${escapeHtml(p.name)}" />` : 'No image'}</td>
      <td>
        <strong>${escapeHtml(p.name)}</strong>
        <small>${escapeHtml(p.description || 'No description')}</small>
      </td>
      <td>
        <strong>${formatMoney(p.price)}</strong>
        ${p.compare_at_price ? `<small>MRP ${formatMoney(p.compare_at_price)}</small>` : ''}
      </td>
      <td><span class="stock-chip ${getProductStockClass(p)}">${escapeHtml(getProductStockLabel(p))}</span></td>
      <td>${escapeHtml(getDeliveryLabel(p.delivery_type))}</td>
      <td><span class="status-badge ${p.is_active ? 'status-paid' : 'status-cancelled'}">${p.is_active ? 'Active' : 'Hidden'}</span></td>
      <td>
        <button class="action-btn edit-product-btn" data-id="${p.id}">Edit</button>
        <button class="action-btn warning" onclick="toggleProductActive('${p.id}')">${p.is_active ? 'Hide' : 'Show'}</button>
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

async function refreshDashboard() {
  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadAbandonedCheckouts(),
    loadLeads()
  ]);
  renderDashboard();
}

function renderDashboardList(id, items, emptyText) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="dashboard-list-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  el.innerHTML = items.join('');
}

function getRecentDayBuckets(days = 7) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    buckets.push({
      key: getIndiaDateKey(date),
      label: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: ADMIN_TIME_ZONE }).format(date),
      revenue: 0,
      orders: 0,
      abandoned: 0
    });
  }
  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));

  getValidOrders().forEach(order => {
    const date = parseOrderCreatedAt(order.created_at);
    if (!date) return;
    const bucket = byKey.get(getIndiaDateKey(date));
    if (!bucket) return;
    bucket.orders += 1;
    bucket.revenue += Number(order.total_amount || 0);
  });

  allAbandonedCheckouts.forEach(checkout => {
    const date = parseCheckoutDate(checkout.updated_at || checkout.created_at);
    if (!date) return;
    const bucket = byKey.get(getIndiaDateKey(date));
    if (bucket) bucket.abandoned += 1;
  });

  return buckets;
}

function renderMiniChart(id, buckets, key, formatter = value => String(value)) {
  const el = document.getElementById(id);
  if (!el) return;
  const max = Math.max(...buckets.map(bucket => Number(bucket[key] || 0)), 0);
  if (!max) {
    el.innerHTML = '<div class="dashboard-list-empty">No activity in the last 7 days.</div>';
    return;
  }
  el.innerHTML = `
    <div class="admin-chart-bars">
      ${buckets.map(bucket => {
        const value = Number(bucket[key] || 0);
        const height = Math.max(8, Math.round((value / max) * 100));
        return `
          <div class="admin-chart-bar" title="${escapeHtml(bucket.label)}: ${escapeHtml(formatter(value))}">
            <span style="height:${height}%"></span>
            <small>${escapeHtml(bucket.label)}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderInventoryHealth() {
  const el = document.getElementById('dashboard-inventory-health');
  if (!el) return;
  const available = allProducts.filter(product => Number(product.stock || 0) > 5).length;
  const low = getLowStockProducts().length;
  const out = getOutOfStockProducts().length;
  const total = Math.max(allProducts.length, 1);
  const segments = [
    ['Healthy', available, 'success'],
    ['Low', low, 'warning'],
    ['Out', out, 'danger']
  ];
  el.innerHTML = `
    <div class="admin-distribution-track">
      ${segments.map(([label, value, tone]) => `
        <span class="${tone}" style="width:${Math.max(4, Math.round((value / total) * 100))}%" title="${escapeHtml(label)}: ${value}"></span>
      `).join('')}
    </div>
    <div class="admin-distribution-legend">
      ${segments.map(([label, value, tone]) => `
        <div><span class="${tone}"></span><strong>${value}</strong><small>${escapeHtml(label)}</small></div>
      `).join('')}
    </div>
  `;
}

function renderProductPerformance() {
  const productsByName = new Map();
  getValidOrders().forEach(order => {
    getOrderItemNames(order).forEach(name => {
      productsByName.set(name, (productsByName.get(name) || 0) + 1);
    });
  });
  const items = [...productsByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `
      <div class="dashboard-list-item">
        <div>
          <strong>${escapeHtml(name)}</strong>
          <small>Appears in ${count} ${count === 1 ? 'order' : 'orders'}</small>
        </div>
        <span class="dashboard-list-value">${count}</span>
      </div>
    `);
  renderDashboardList('dashboard-product-performance', items, 'Product performance appears when order item history is available.');
}

function renderRecentOrders() {
  const recent = getValidOrders()
    .slice()
    .sort((a, b) => (parseOrderCreatedAt(b.created_at)?.getTime() || 0) - (parseOrderCreatedAt(a.created_at)?.getTime() || 0))
    .slice(0, 5)
    .map(order => `
      <div class="dashboard-list-item activity-order">
        <div>
          <strong>${escapeHtml(order.customer_name || 'Customer')}</strong>
          <small>${escapeHtml(getShortOrderId(order))} - ${escapeHtml(getOrderDate(order))}</small>
        </div>
        <div class="activity-order-meta">
          <span class="status-badge status-${escapeHtml(order.payment_status || 'pending')}">${escapeHtml(order.payment_status || 'pending')}</span>
          <strong>${formatMoney(order.total_amount)}</strong>
        </div>
      </div>
    `);
  renderDashboardList('dashboard-recent-orders', recent, 'Recent orders will appear here after checkout activity.');
}

function renderDashboardVisuals() {
  const buckets = getRecentDayBuckets(7);
  renderMiniChart('dashboard-revenue-chart', buckets, 'revenue', formatMoney);
  renderMiniChart('dashboard-order-chart', buckets, 'orders', value => `${value} ${value === 1 ? 'order' : 'orders'}`);
  renderInventoryHealth();
  renderProductPerformance();
  renderRecentOrders();
}

function renderDashboard() {
  const validOrders = getValidOrders();
  const todayOrders = validOrders.filter(order => isWithinDateFilter(order, 'today'));
  const todayRevenue = todayOrders
    .filter(order => normalizeOrderField(order.payment_status) === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const pendingFulfilment = validOrders.filter(order => ['new', 'processing'].includes(normalizeOrderField(order.order_status || 'new')));
  const customers = buildCustomerProfiles();
  const repeatCustomers = customers.filter(customer => customer.orderCount > 1);

  setText('metric-today-revenue', formatMoney(todayRevenue));
  setText('metric-today-orders', String(todayOrders.length));
  setText('metric-fulfilment-orders', String(pendingFulfilment.length));
  updateProductMetrics();

  const priorityOrderItems = pendingFulfilment.slice(0, 5).map(order => `
    <div class="dashboard-list-item">
      <div>
        <strong>${escapeHtml(getShortOrderId(order))} - ${escapeHtml(order.customer_name || 'Customer')}</strong>
        <small>${escapeHtml(order.customer_phone || 'No phone')} - ${escapeHtml(order.order_status || 'new')} - ${escapeHtml(getOrderDate(order))}</small>
      </div>
      <button class="action-btn" type="button" onclick="openOrderModal('${order.id}')">Open</button>
    </div>
  `);

  const stockAlertItems = [...getOutOfStockProducts(), ...getLowStockProducts()].slice(0, 6).map(product => `
    <div class="dashboard-list-item">
      <div>
        <strong>${escapeHtml(product.name || 'Product')}</strong>
        <small>${escapeHtml(product.is_active ? 'Visible on store' : 'Hidden')} - ${escapeHtml(getDeliveryLabel(product.delivery_type))}</small>
      </div>
      <span class="stock-chip ${getProductStockClass(product)}">${escapeHtml(getProductStockLabel(product))}</span>
    </div>
  `);

  const customerSignalItems = customers.slice(0, 5).map(customer => `
    <div class="dashboard-list-item">
      <div>
        <strong>${escapeHtml(customer.name || 'Customer')}</strong>
        <small>${customer.orderCount} orders - ${escapeHtml(customer.phone || customer.email || 'No contact')} - last ${escapeHtml(formatCustomerDate(customer.lastOrderDate))}</small>
      </div>
      <span class="dashboard-list-value">${formatMoney(customer.totalSpent)}</span>
    </div>
  `);

  const recoveryItems = allAbandonedCheckouts.slice(0, 5).map(checkout => {
    const whatsappUrl = buildAbandonedWhatsappUrl(checkout);
    return `
      <div class="dashboard-list-item">
        <div>
          <strong>${escapeHtml(checkout.customer_name || 'Checkout visitor')}</strong>
          <small>${escapeHtml(checkout.customer_phone || checkout.customer_email || 'No contact')} - ${escapeHtml(getCheckoutDate(checkout))}</small>
        </div>
        ${whatsappUrl ? `<a class="action-btn abandoned-whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="dashboard-list-value">${formatMoney(checkout.cart_total)}</span>`}
      </div>
    `;
  });

  renderDashboardList('dashboard-priority-orders', priorityOrderItems, 'No pending orders need action.');
  renderDashboardList('dashboard-inventory-alerts', stockAlertItems, 'No low-stock or out-of-stock products.');
  renderDashboardList('dashboard-customer-signals', customerSignalItems, repeatCustomers.length ? `${repeatCustomers.length} repeat customers in order history.` : 'Customer activity appears after orders are placed.');
  renderDashboardList('dashboard-recovery-queue', recoveryItems, 'No open abandoned checkouts.');
  renderDashboardVisuals();

  const note = document.getElementById('dashboard-refresh-note');
  if (note) {
    const time = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: ADMIN_TIME_ZONE,
    });
    note.textContent = `Live admin overview - Updated ${time}`;
  }
}

function exportProductsCsv() {
  const rows = [[
    'id', 'name', 'description', 'price', 'compare_at_price', 'stock', 'delivery_zone', 'active', 'images'
  ]];
  getFilteredProducts().forEach(product => {
    rows.push([
      product.id,
      product.name,
      product.description || '',
      product.price,
      product.compare_at_price || '',
      product.stock,
      getDeliveryLabel(product.delivery_type),
      product.is_active ? 'yes' : 'no',
      (product.images || []).join(' | ')
    ]);
  });
  downloadCsv(`canecreme-products-${getIndiaDateKey(new Date())}.csv`, rows);
}

function exportOrdersCsv() {
  const rows = [[
    'id', 'short_id', 'customer_name', 'email', 'phone', 'total', 'payment_status', 'order_status', 'created_at', 'address'
  ]];
  getFilteredOrders().forEach(order => {
    rows.push([
      order.id,
      getShortOrderId(order),
      order.customer_name || '',
      order.customer_email || '',
      order.customer_phone || '',
      order.total_amount || 0,
      order.payment_status || '',
      order.order_status || '',
      getOrderDate(order),
      getAddressText(order)
    ]);
  });
  downloadCsv(`canecreme-orders-${getIndiaDateKey(new Date())}.csv`, rows);
}

function exportCustomersCsv() {
  const rows = [[
    'customer', 'phone', 'email', 'city', 'orders', 'total_spent', 'paid_orders', 'cod_orders', 'first_seen', 'last_activity', 'top_products'
  ]];
  getFilteredCustomers().forEach(customer => {
    rows.push([
      customer.name || '',
      customer.phone || '',
      customer.email || '',
      customer.city || '',
      customer.orderCount,
      customer.totalSpent,
      customer.paidOrders,
      customer.codOrders,
      formatCustomerDate(customer.firstOrderDate),
      formatCustomerDate(customer.lastOrderDate),
      customer.topProducts.join(' | ')
    ]);
  });
  downloadCsv(`canecreme-customers-${getIndiaDateKey(new Date())}.csv`, rows);
}

function exportAbandonedCsv() {
  const rows = [[
    'id', 'customer_name', 'phone', 'email', 'cart_total', 'payment_method', 'last_step', 'last_activity', 'address', 'items'
  ]];
  getFilteredAbandonedCheckouts().forEach(checkout => {
    rows.push([
      checkout.id,
      checkout.customer_name || '',
      checkout.customer_phone || '',
      checkout.customer_email || '',
      checkout.cart_total || 0,
      checkout.payment_method || '',
      checkout.last_step || '',
      getCheckoutDate(checkout),
      getCheckoutAddressText(checkout),
      getCheckoutItemNames(checkout).join(' | ')
    ]);
  });
  downloadCsv(`canecreme-abandoned-${getIndiaDateKey(new Date())}.csv`, rows);
}

function getDiscountStatusClass(status) {
  if (status === 'active') return 'status-paid';
  if (status === 'used') return 'status-processing';
  if (status === 'expired') return 'status-cancelled';
  return 'status-pending';
}

function getDiscountTypeLabel(type) {
  if (type === 'amount_product') return 'Amount off product';
  if (type === 'free_shipping') return 'Free shipping';
  if (type === 'none') return 'No offer';
  return 'Amount off order';
}

function getRecoveryDiscountStatus(offer) {
  const expiresAt = offer?.expires_at ? new Date(offer.expires_at).getTime() : 0;
  if (offer?.used_at || offer?.status === 'recovered') return 'used';
  if (offer?.status === 'expired' || (expiresAt && expiresAt <= Date.now())) return 'expired';
  return 'active';
}

function mapRecoveryOfferType(offer) {
  if (offer?.offer_type === 'free_shipping') return 'free_shipping';
  if (offer?.offer_type === 'none') return 'none';
  if (offer?.offer_key && String(offer.offer_key).startsWith('amount_')) return 'amount_order';
  return 'amount_product';
}

function getDiscountRows() {
  const welcomeOrders = getValidOrders().filter(order => normalizeOrderField(order.coupon_code) === 'welcome10');
  const welcomeDiscount = welcomeOrders.reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
  const rows = [{
    id: 'welcome10',
    title: 'WELCOME10',
    subtitle: '10% off first order popup coupon',
    status: 'active',
    method: 'Code',
    eligibility: 'New customers',
    type: 'amount_order',
    typeLabel: 'Amount off order',
    combinations: 'Order discount',
    used: welcomeOrders.length,
    discountValue: welcomeDiscount,
    source: 'Popup leads',
    expiresAt: ''
  }];

  allAbandonedCheckouts.forEach(checkout => {
    const offer = checkout.recovery_offer;
    if (!offer) return;
    const type = mapRecoveryOfferType(offer);
    const status = getRecoveryDiscountStatus(offer);
    rows.push({
      id: offer.id || `${checkout.id}-${offer.coupon_code || offer.offer_key || 'offer'}`,
      title: offer.offer_type === 'none' ? 'No offer follow-up' : (offer.coupon_code || offer.offer_label || 'Recovery offer'),
      subtitle: offer.offer_label || 'Abandoned checkout recovery',
      status,
      method: offer.offer_type === 'none' ? 'Manual' : 'Code',
      eligibility: checkout.customer_name || checkout.customer_phone || checkout.customer_email || 'Specific checkout',
      type,
      typeLabel: getDiscountTypeLabel(type),
      combinations: type === 'free_shipping' ? 'Shipping' : 'Checkout recovery',
      used: status === 'used' ? 1 : 0,
      discountValue: 0,
      source: 'Abandoned checkout',
      expiresAt: offer.expires_at || ''
    });
  });

  return rows;
}

function getFilteredDiscountRows() {
  const search = (document.getElementById('discount-search')?.value || '').trim().toLowerCase();
  const status = document.getElementById('discount-status-filter')?.value || 'all';
  const type = document.getElementById('discount-type-filter')?.value || 'all';

  return getDiscountRows().filter(row => {
    const text = [
      row.title,
      row.subtitle,
      row.status,
      row.method,
      row.eligibility,
      row.typeLabel,
      row.combinations,
      row.source
    ].filter(Boolean).join(' ').toLowerCase();
    return (!search || text.includes(search)) &&
      (status === 'all' || row.status === status) &&
      (type === 'all' || row.type === type);
  });
}

function updateDiscountMetrics() {
  const rows = getDiscountRows();
  const active = rows.filter(row => row.status === 'active').length;
  const used = rows.reduce((sum, row) => sum + Number(row.used || 0), 0);
  const discountValue = getValidOrders().reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
  const recovery = rows.filter(row => row.source === 'Abandoned checkout').length;
  setText('metric-discounts-active', String(active));
  setText('metric-discounts-used', String(used));
  setText('metric-discounts-value', formatMoney(discountValue));
  setText('metric-discounts-recovery', String(recovery));
}

function renderDiscounts() {
  const tbody = document.getElementById('discounts-table-body');
  if (!tbody) return;
  const rows = getFilteredDiscountRows();
  updateDiscountMetrics();

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No discounts match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${escapeHtml(row.title)}</strong>
        <small>${escapeHtml(row.subtitle || row.source)}</small>
      </td>
      <td><span class="status-badge ${getDiscountStatusClass(row.status)}">${escapeHtml(row.status.replace(/\b\w/g, char => char.toUpperCase()))}</span></td>
      <td>${escapeHtml(row.method)}</td>
      <td>${escapeHtml(row.eligibility)}</td>
      <td>${escapeHtml(row.typeLabel)}</td>
      <td><span class="discount-combination">${escapeHtml(row.combinations)}</span></td>
      <td>${escapeHtml(String(row.used || 0))}</td>
    </tr>
  `).join('');
}

async function loadDiscountSources() {
  const tbody = document.getElementById('discounts-table-body');
  if (tbody && !getDiscountRows().length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading...</td></tr>';
  }
  await Promise.all([
    loadOrders(),
    loadAbandonedCheckouts(),
    loadLeads()
  ]);
  renderDiscounts();
}

function exportDiscountsCsv() {
  const rows = [[
    'title', 'subtitle', 'status', 'method', 'eligibility', 'type', 'combinations', 'used', 'source', 'expires_at'
  ]];
  getFilteredDiscountRows().forEach(row => {
    rows.push([
      row.title,
      row.subtitle || '',
      row.status,
      row.method,
      row.eligibility,
      row.typeLabel,
      row.combinations,
      row.used || 0,
      row.source,
      row.expiresAt || ''
    ]);
  });
  downloadCsv(`canecreme-discounts-${getIndiaDateKey(new Date())}.csv`, rows);
  recordActivity('Exported discounts', 'Downloaded discount and recovery offer CSV');
}

function getLeadDate(lead) {
  const date = parseOrderCreatedAt(lead.created_at);
  if (!date) return '';
  return getOrderDate({ created_at: date.toISOString() });
}

function getLeadSearchText(lead) {
  return [
    lead.name,
    lead.phone,
    lead.email,
    lead.source,
    'WELCOME10',
    lead.coupon_code
  ].filter(Boolean).join(' ').toLowerCase();
}

function getFilteredLeads() {
  const search = (document.getElementById('lead-search')?.value || '').trim().toLowerCase();
  const date = document.getElementById('lead-date-filter')?.value || 'all';
  const contact = document.getElementById('lead-contact-filter')?.value || 'all';

  return allLeads.filter(lead => {
    const matchesSearch = !search || getLeadSearchText(lead).includes(search);
    const matchesDate = date === 'all' || isWithinDateFilter({ created_at: lead.created_at }, date);
    const matchesContact =
      contact === 'all' ||
      (contact === 'phone' && lead.phone) ||
      (contact === 'email' && lead.email);
    return matchesSearch && matchesDate && matchesContact;
  });
}

function updateLeadMetrics() {
  const today = allLeads.filter(lead => isWithinDateFilter({ created_at: lead.created_at }, 'today')).length;
  const withPhone = allLeads.filter(lead => lead.phone).length;
  setText('metric-leads-total', String(allLeads.length));
  setText('metric-leads-today', String(today));
  setText('metric-leads-phone', String(withPhone));
}

function updateLeadsRefreshNote() {
  const el = document.getElementById('leads-refresh-note');
  if (!el) return;
  const time = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: ADMIN_TIME_ZONE,
  });
  el.textContent = `Saved from WELCOME10 popup - Updated ${time}`;
}

function buildLeadWhatsappMessage() {
  return [
    '\u{1F6A8} Rakhi Alert! Rakhi Alert! \u{1F6A8}',
    '',
    'Still haven\u2019t done your Rakhi shopping? \u{1F440}',
    'Your sibling is waiting\u2026 and \u201cI\u2019ll buy it tomorrow\u201d is running out of tomorrows! \u{1F602}',
    '',
    '\u{1F381} Last chance to grab the goodies!',
    '\u{1F36A} Treats? Sorted.',
    '\u{1F49D} Gifting? Sorted.',
    '\u{1F60E} Being the favourite sibling? Almost sorted.',
    '',
    'And yes\u2026 10% OFF your first order \u{1F389}',
    '\u{1F3F7}\u{FE0F} Use WELCOME10',
    '',
    'Order now before Rakhi catches you unprepared! \u{1F602}\u{2764}\u{FE0F}',
    '',
    '\u2014 CaneCreme'
  ].join('\n');
}

function buildLeadWhatsappUrl(lead) {
  const phone = normalizeWhatsappPhone(lead.phone);
  if (!phone) return '';
  const params = new URLSearchParams({
    phone,
    text: buildLeadWhatsappMessage()
  });
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

async function copyLeadWhatsappMessage() {
  const message = buildLeadWhatsappMessage();
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(message);
    alert('WhatsApp message copied. Paste it into the chat if WhatsApp removes emojis.');
  } catch (_) {
    prompt('Copy this WhatsApp message:', message);
  }
}

async function loadLeads() {
  if (leadsLoading) return;
  leadsLoading = true;
  const tbody = document.getElementById('leads-table-body');
  if (tbody && allLeads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">Loading...</td></tr>';
  }

  try {
    const data = await callAdminLeads('list');
    allLeads = Array.isArray(data.leads) ? data.leads : [];
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#dc2626;">${escapeHtml(error.message || 'Popup leads could not be loaded.')}</td></tr>`;
    }
    leadsLoading = false;
    return;
  }

  updateLeadMetrics();
  renderLeads();
  renderDiscounts();
  updateLeadsRefreshNote();
  leadsLoading = false;
}

function renderLeads() {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  const leads = getFilteredLeads();

  if (allLeads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No popup leads yet. Submitted WELCOME10 popup forms will appear here.</td></tr>';
    updateLeadMetrics();
    return;
  }

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b6b6b;">No popup leads match these filters.</td></tr>';
    updateLeadMetrics();
    return;
  }

  tbody.innerHTML = leads.map(lead => {
    const whatsappUrl = buildLeadWhatsappUrl(lead);
    const email = String(lead.email || '').trim();
    return `
      <tr>
        <td>
          <strong>${escapeHtml(lead.name || 'Popup lead')}</strong>
          <small>${escapeHtml(lead.id || 'Lead from entry popup')}</small>
        </td>
        <td>${escapeHtml(lead.phone || 'No phone')}</td>
        <td>${escapeHtml(email || 'No email')}</td>
        <td><span class="status-badge status-paid">${escapeHtml(lead.coupon_code || 'WELCOME10')}</span></td>
        <td>${escapeHtml(lead.source || 'popup')}</td>
        <td>${escapeHtml(getLeadDate(lead) || 'N/A')}</td>
        <td class="abandoned-actions">
          ${whatsappUrl ? `<a class="action-btn abandoned-whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${whatsappUrl ? '<button class="action-btn" type="button" onclick="copyLeadWhatsappMessage()">Copy Text</button>' : ''}
          ${email ? `<a class="action-btn" href="mailto:${escapeHtml(email)}?subject=${encodeURIComponent('CaneCreme WELCOME10 coupon')}">Email</a>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  updateLeadMetrics();
}

function exportLeadsCsv() {
  const rows = [[
    'id', 'name', 'phone', 'email', 'coupon_code', 'source', 'created_at'
  ]];
  getFilteredLeads().forEach(lead => {
    rows.push([
      lead.id || '',
      lead.name || '',
      lead.phone || '',
      lead.email || '',
      lead.coupon_code || 'WELCOME10',
      lead.source || 'popup',
      getLeadDate(lead)
    ]);
  });
  downloadCsv(`canecreme-popup-leads-${getIndiaDateKey(new Date())}.csv`, rows);
  recordActivity('Exported popup leads', 'Downloaded WELCOME10 popup leads CSV');
}

function mapAdminUserRecord(user) {
  const role = user.role || 'admin';
  const status = user.status || 'active';
  return {
    id: user.id || 'owner',
    name: user.full_name || user.name || 'Admin User',
    email: user.email || '',
    phone: user.phone || '',
    role,
    roleLabel: role.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
    status: status === 'invited' ? 'pending' : status,
    note: user.deleted_at ? 'Soft deleted' : 'Server-backed admin user',
    activity: user.last_login_at ? `Last login ${getOrderDate({ created_at: user.last_login_at })}` : 'No tracked login yet',
    lastLogin: user.last_login_at ? getOrderDate({ created_at: user.last_login_at }) : 'Not tracked',
    createdAt: user.created_at ? getOrderDate({ created_at: user.created_at }) : 'Not tracked',
    twoFactorEnabled: Boolean(user.two_factor_enabled),
    twoFactorRequired: Boolean(user.two_factor_required),
    failedLoginCount: Number(user.failed_login_count || 0),
    lastFailedLogin: user.last_failed_login_at ? getOrderDate({ created_at: user.last_failed_login_at }) : '',
    isOwner: role === 'owner',
    permissions: getPermissionsForRole(role)
  };
}

function getFallbackAdminUsers() {
  return [{
    id: 'owner',
    name: 'CaneCreme Owner',
    email: STORE_EMAIL || 'canecreme@gmail.com',
    phone: STORE_PHONE || '9891239312',
    role: 'owner',
    roleLabel: 'Owner',
    status: 'active',
    note: 'Current owner account for this static admin panel',
    activity: 'Full current admin access through the existing admin session',
    lastLogin: getAdminSession() ? 'Current session' : 'Not tracked',
    createdAt: 'Existing admin account',
    twoFactorEnabled: false,
    twoFactorRequired: true,
    failedLoginCount: 0,
    isOwner: true,
    permissions: getOwnerPermissionMatrix()
  }];
}

async function loadAdminUsers() {
  if (adminUsersLoading) return;
  adminUsersLoading = true;
  const tbody = document.getElementById('users-table-body');
  if (tbody && allAdminUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="admin-skeleton-row"></div></td></tr>';
  }

  try {
    const data = await callAdminUsers('list');
    allAdminUsers = Array.isArray(data.users) ? data.users.map(mapAdminUserRecord) : [];
    allAdminInvites = Array.isArray(data.invites) ? data.invites : [];
    try {
      const permissionData = await callAdminUsers('permissions');
      allAdminRolePermissions = Array.isArray(permissionData.permissions) ? permissionData.permissions : [];
    } catch (error) {
      allAdminRolePermissions = [];
    }
  } catch (error) {
    allAdminUsers = getFallbackAdminUsers();
    allAdminInvites = [];
    allAdminRolePermissions = [];
    recordActivity('Admin users fallback', error.message || 'Using local owner-only fallback');
  }

  renderUserManagement();
  adminUsersLoading = false;
}

function renderUserManagement() {
  const users = getFilteredAdminUsers();
  const list = document.getElementById('admin-users-list');
  if (list) {
    const allUsers = buildAdminUsers();
    list.innerHTML = `
      <div class="dashboard-list-item">
        <div>
          <strong>Current access model</strong>
          <small>Single owner account protected by the existing admin session flow.</small>
        </div>
        <span class="status-badge status-paid">Active</span>
      </div>
      <div class="dashboard-list-item">
        <div>
          <strong>Configured users</strong>
          <small>${allUsers.length} real ${allUsers.length === 1 ? 'user' : 'users'} available in this admin build.</small>
        </div>
        <span class="dashboard-list-value">${allUsers.length}</span>
      </div>
      <div class="dashboard-list-item">
        <div>
          <strong>Staff invitations</strong>
          <small>${allAdminInvites.length} active ${allAdminInvites.length === 1 ? 'invite' : 'invites'}.</small>
        </div>
        <span class="status-badge status-pending">${allAdminInvites.length} Pending</span>
      </div>
      ${allAdminInvites.slice(0, 4).map(invite => `
        <div class="dashboard-list-item">
          <div>
            <strong>${escapeHtml(invite.email || 'Invited user')}</strong>
            <small>${escapeHtml(invite.role || 'role')} - expires ${escapeHtml(invite.expires_at ? getOrderDate({ created_at: invite.expires_at }) : 'soon')}</small>
          </div>
          <button class="action-btn" type="button" onclick="resendAdminInvite('${escapeHtml(invite.id)}')">Resend</button>
        </div>
      `).join('')}
    `;
  }

  updateUserMetrics();
  renderPermissionMatrix();

  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="admin-empty-state"><strong>No users found</strong><small>Try changing the search or filters. No fake staff records are generated.</small></div></td></tr>';
    return;
  }
  tbody.innerHTML = users.map(user => {
    const userId = encodeURIComponent(user.id);
    return `
    <tr class="user-row">
      <td>
        <div class="user-cell">
          <span class="user-avatar">${escapeHtml(getUserInitials(user.name))}</span>
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <small>${escapeHtml(user.email || 'No email on file')}</small>
          </div>
        </div>
      </td>
      <td><span class="role-badge role-${escapeHtml(user.role)}">${escapeHtml(user.roleLabel)}</span></td>
      <td><span class="status-badge ${getUserStatusClass(user.status)}">${escapeHtml(getUserStatusLabel(user.status))}</span></td>
      <td>${escapeHtml(maskPhone(user.phone))}</td>
      <td>${escapeHtml(user.lastLogin || 'Not tracked')}</td>
      <td>${escapeHtml(user.createdAt || 'Not tracked')}</td>
      <td><span class="status-badge ${user.twoFactorEnabled ? 'status-paid' : 'status-pending'}">${user.twoFactorEnabled ? 'Enabled' : 'Not configured'}</span></td>
      <td class="user-actions-cell">
        <div class="user-action-menu">
          <button class="action-btn" type="button" onclick="toggleUserActionMenu('${userId}')">Actions</button>
          <div class="user-action-menu-list" id="user-actions-${escapeHtml(user.id)}">
            <button type="button" onclick="openUserDrawer('${userId}')">View details</button>
            <button type="button" onclick="handleUserAdminAction('${userId}', 'edit')">Edit user</button>
            <button type="button" onclick="handleUserAdminAction('${userId}', 'reset_password')">Reset password</button>
            <button type="button" onclick="handleUserAdminAction('${userId}', '${user.status === 'suspended' ? 'activate' : 'suspend'}')">${user.status === 'suspended' ? 'Activate' : 'Suspend'}</button>
            <button type="button" onclick="handleUserAdminAction('${userId}', 'activity')">View activity log</button>
            <button class="danger" type="button" ${user.isOwner ? 'disabled title="Owner account cannot be deleted"' : ''} onclick="handleUserAdminAction('${userId}', 'delete')">Delete user</button>
          </div>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function buildAdminUsers() {
  return allAdminUsers.length ? allAdminUsers : getFallbackAdminUsers();
}

function getFilteredAdminUsers() {
  const search = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
  const role = document.getElementById('user-role-filter')?.value || 'all';
  const status = document.getElementById('user-status-filter')?.value || 'all';

  return buildAdminUsers().filter(user => {
    const text = [user.name, user.email, user.phone, user.roleLabel, user.status, user.note, user.activity].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const matchesRole = role === 'all' || user.role === role;
    const matchesStatus = status === 'all' || user.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });
}

function updateUserMetrics() {
  const users = buildAdminUsers();
  setText('metric-admin-users', String(users.length));
  setText('metric-active-users', String(users.filter(user => user.status === 'active').length));
  setText('metric-pending-users', String(users.filter(user => user.status === 'pending').length + allAdminInvites.length));
  setText('metric-suspended-users', String(users.filter(user => user.status === 'suspended').length));
  setText('metric-super-admins', String(users.filter(user => user.role === 'super_admin').length));
}

function getUserById(encodedId) {
  const id = decodeURIComponent(encodedId);
  return buildAdminUsers().find(user => user.id === id);
}

function getUserInitials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('') || 'U';
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return 'No phone';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `${local.slice(0, 2)}••••••${local.slice(-2)}`;
}

function getUserStatusLabel(status) {
  const labels = {
    active: 'Active',
    pending: 'Pending Invite',
    suspended: 'Suspended'
  };
  return labels[status] || status || 'Unknown';
}

function getUserStatusClass(status) {
  if (status === 'active') return 'status-paid';
  if (status === 'suspended') return 'status-cancelled';
  return 'status-pending';
}

function getOwnerPermissionMatrix() {
  return {
    dashboard: ['view', 'export'],
    orders: ['view', 'edit', 'export'],
    products: ['view', 'create', 'edit', 'delete', 'export'],
    customers: ['view', 'export'],
    reports: ['view', 'export'],
    settings: ['view', 'edit'],
    security: ['view', 'export'],
    backups: ['view', 'export']
  };
}

function getPermissionsForRole(role) {
  if (role === 'owner' || !allAdminRolePermissions.length) {
    return role === 'owner' ? getOwnerPermissionMatrix() : {};
  }
  return allAdminRolePermissions
    .filter(permission => permission.role === role && permission.allowed)
    .reduce((matrix, permission) => {
      matrix[permission.module] = matrix[permission.module] || [];
      matrix[permission.module].push(permission.action);
      return matrix;
    }, {});
}

function renderPermissionMatrix() {
  const el = document.getElementById('user-permission-matrix');
  if (!el) return;
  const users = buildAdminUsers();
  const selectedUser = users.find(user => user.isOwner) || users[0];
  if (!selectedUser) {
    el.innerHTML = '<div class="admin-empty-state"><strong>No permissions configured</strong><small>Permissions will appear after real admin users are available.</small></div>';
    return;
  }
  const modules = ['dashboard', 'orders', 'products', 'customers', 'reports', 'settings', 'security', 'backups'];
  const actions = ['view', 'create', 'edit', 'delete', 'export', 'manage permissions'];
  el.innerHTML = `
    <table class="permission-matrix">
      <thead>
        <tr>
          <th>Module</th>
          ${actions.map(action => `<th>${escapeHtml(action)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${modules.map(module => `
          <tr>
            <td><strong>${escapeHtml(module.replace(/\b\w/g, char => char.toUpperCase()))}</strong><small>${escapeHtml(selectedUser.roleLabel)}</small></td>
            ${actions.map(action => {
              const permissionAction = action === 'manage permissions' ? 'manage' : action;
              const allowed = selectedUser.permissions[module]?.includes(permissionAction);
              return `<td><span class="permission-dot ${allowed ? 'allowed' : 'blocked'}">${allowed ? '✓' : '–'}</span></td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p class="admin-note">Permissions are read from the server-backed role matrix when available. Owner safeguards are enforced server-side.</p>
  `;
}

function toggleUserActionMenu(encodedId) {
  const user = getUserById(encodedId);
  if (!user) return;
  document.querySelectorAll('.user-action-menu-list.open').forEach(menu => {
    if (menu.id !== `user-actions-${user.id}`) menu.classList.remove('open');
  });
  document.getElementById(`user-actions-${user.id}`)?.classList.toggle('open');
}

async function handleUserAdminAction(encodedId, action) {
  const user = getUserById(encodedId);
  if (!user) return;
  document.querySelectorAll('.user-action-menu-list.open').forEach(menu => menu.classList.remove('open'));

  if (action === 'activity') {
    openUserDrawer(encodedId);
    return;
  }

  if (action === 'delete' && user.isOwner) {
    alert('The owner account cannot be deleted.');
    return;
  }

  if (action === 'delete' && !confirm(`Delete ${user.name}? This cannot be undone.`)) return;
  if (['suspend', 'activate'].includes(action) && !confirm(`${action === 'suspend' ? 'Suspend' : 'Activate'} ${user.name}?`)) return;
  if (action === 'reset_password' && !confirm(`Send a password reset for ${user.name}?`)) return;

  try {
    if (action === 'suspend' || action === 'activate') {
      await callAdminUsers('update_status', {
        user_id: user.id,
        status: action === 'suspend' ? 'suspended' : 'active'
      });
      recordActivity('Updated user status', `${user.name}: ${action}`);
      await loadAdminUsers();
      return;
    }

    if (action === 'delete') {
      await callAdminUsers('soft_delete', { user_id: user.id, reason: 'Deleted from admin Users page' });
      recordActivity('Requested/deleted user', user.name);
      await loadAdminUsers();
      return;
    }

    if (action === 'reset_password') {
      alert('Password reset emails require an email delivery integration. No password was changed.');
      return;
    }

    if (action === 'edit') {
      openUserDrawer(encodedId);
      return;
    }
  } catch (error) {
    alert(error.message || 'User action failed.');
  }
}

function openUserDrawer(encodedId) {
  const user = getUserById(encodedId);
  if (!user) return;
  const overlay = document.getElementById('user-drawer-overlay');
  const title = document.getElementById('user-drawer-title');
  const body = document.getElementById('user-drawer-body');
  if (!overlay || !body) return;
  if (title) title.textContent = user.name;
  body.innerHTML = `
    <div class="drawer-profile-card">
      <span class="user-avatar large">${escapeHtml(getUserInitials(user.name))}</span>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email || 'No email')}</small>
        <div class="drawer-badge-row">
          <span class="role-badge role-${escapeHtml(user.role)}">${escapeHtml(user.roleLabel)}</span>
          <span class="status-badge ${getUserStatusClass(user.status)}">${escapeHtml(getUserStatusLabel(user.status))}</span>
        </div>
      </div>
    </div>
    <div class="drawer-section">
      <h4>Security</h4>
      <div class="drawer-detail-grid">
        <div><span>2FA</span><strong>${user.twoFactorEnabled ? 'Enabled' : 'Not configured'}</strong></div>
        <div><span>Last login</span><strong>${escapeHtml(user.lastLogin || 'Not tracked')}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(maskPhone(user.phone))}</strong></div>
        <div><span>Created</span><strong>${escapeHtml(user.createdAt || 'Not tracked')}</strong></div>
      </div>
    </div>
    <div class="drawer-section">
      <h4>Assigned Permissions</h4>
      <div class="drawer-permissions">
        ${Object.entries(user.permissions || {}).map(([module, actions]) => `
          <div>
            <strong>${escapeHtml(module.replace(/\b\w/g, char => char.toUpperCase()))}</strong>
            <small>${escapeHtml(actions.join(', '))}</small>
          </div>
        `).join('') || '<div class="admin-empty-state"><strong>No assigned permissions</strong><small>No permissions are connected for this user.</small></div>'}
      </div>
    </div>
    <div class="drawer-section">
      <h4>Activity Log</h4>
      <div class="dashboard-list-item">
        <div>
          <strong>${escapeHtml(user.activity)}</strong>
          <small>Detailed per-user audit logs require a backend activity table.</small>
        </div>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function closeUserDrawer() {
  const overlay = document.getElementById('user-drawer-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function openInviteUserPrompt() {
  const email = prompt('Invite email address');
  if (!email) return;
  const role = prompt('Role: super_admin, admin, manager, support, marketing', 'support');
  if (!role) return;
  try {
    const data = await callAdminUsers('invite', {
      email,
      role,
      full_name: email
    });
    await loadAdminUsers();
    alert(`Invite created. One-time setup token:\n${data.invite_token}\n\nShare this only with the intended user. Email sending is not connected yet.`);
  } catch (error) {
    alert(error.message || 'Invite failed.');
  }
}

async function resendAdminInvite(inviteId) {
  if (!confirm('Generate a new expiring invite token? The previous token will stop working.')) return;
  try {
    const data = await callAdminUsers('resend_invite', { invite_id: inviteId });
    await loadAdminUsers();
    alert(`Invite resent. New one-time setup token:\n${data.invite_token}`);
  } catch (error) {
    alert(error.message || 'Invite resend failed.');
  }
}

function exportUsersCsv() {
  const rows = [
    ['name', 'email', 'phone_masked', 'role', 'status', 'last_login', 'created_at', 'two_factor', 'activity', 'notes']
  ];
  getFilteredAdminUsers().forEach(user => {
    rows.push([
      user.name,
      user.email || '',
      maskPhone(user.phone),
      user.roleLabel,
      getUserStatusLabel(user.status),
      user.lastLogin || 'Not tracked',
      user.createdAt || 'Not tracked',
      user.twoFactorEnabled ? 'enabled' : 'not configured',
      user.activity,
      user.note
    ]);
  });
  downloadCsv(`canecreme-users-${getIndiaDateKey(new Date())}.csv`, rows);
  recordActivity('Exported users', 'Downloaded admin and planned staff user CSV');
}

function getDefaultContentItems() {
  return [
    { id: 'page-home', group: 'pages', title: 'Home', path: 'index.html', note: 'Hero, collections, featured products, story, gallery', status: 'published', seoTitle: 'CaneCreme - Natural Gelato, Cookies & Healthy Treats', seoDescription: 'Shop CaneCreme natural gelato, cookies, syrups, jams, and guilt-free treats made with raw cane sugar.' },
    { id: 'page-shop', group: 'pages', title: 'Shop', path: 'shop.html', note: 'All products and category filtering', status: 'published', seoTitle: 'Shop CaneCreme Products', seoDescription: 'Browse CaneCreme gelato, spreads, cookies, syrups, and wholesome treats.' },
    { id: 'page-about', group: 'pages', title: 'About', path: 'about.html', note: 'Brand story', status: 'published', seoTitle: 'About CaneCreme', seoDescription: 'Learn about CaneCreme and its natural, raw cane sugar dessert philosophy.' },
    { id: 'page-product-detail', group: 'pages', title: 'Product Detail', path: 'product.html', note: 'Dynamic product pages from Supabase', status: 'published', seoTitle: 'CaneCreme Product Details', seoDescription: 'View CaneCreme product ingredients, pricing, images, stock, and ordering options.' },
    { id: 'page-shipping', group: 'pages', title: 'Shipping Policy', path: 'shipping-policy.html', note: 'Delivery policy', status: 'published', seoTitle: 'Shipping Policy - CaneCreme', seoDescription: 'Read CaneCreme shipping, delivery timelines, and service area information.' },
    { id: 'page-returns', group: 'pages', title: 'Returns', path: 'return-policy.html', note: 'Returns and refunds', status: 'published', seoTitle: 'Returns & Refunds - CaneCreme', seoDescription: 'Read CaneCreme return, refund, and cancellation policy information.' },
    { id: 'page-privacy', group: 'pages', title: 'Privacy', path: 'privacy-policy.html', note: 'Privacy policy', status: 'published', seoTitle: 'Privacy Policy - CaneCreme', seoDescription: 'Read how CaneCreme handles customer privacy and data.' },
    { id: 'page-terms', group: 'pages', title: 'Terms', path: 'terms.html', note: 'Terms and conditions', status: 'published', seoTitle: 'Terms & Conditions - CaneCreme', seoDescription: 'Read CaneCreme website and purchase terms.' },
    { id: 'media-product-images', group: 'media', title: 'Product images', path: 'Assets/', note: 'Currently managed through product image paths and the local Assets folder.', status: 'published', seoTitle: '', seoDescription: 'Product image assets used across shop and product pages.' },
    { id: 'media-upload-manager', group: 'media', title: 'Upload manager', path: 'Supabase Storage', note: 'Requires Supabase Storage or GitHub upload workflow before enabling browser uploads.', status: 'needs backend', seoTitle: '', seoDescription: 'Planned browser upload workflow for product, banner, and policy assets.' },
    { id: 'media-storage-next-step', group: 'media', title: 'Recommended next step', path: 'Supabase buckets', note: 'Add Supabase Storage buckets for product, banner, and policy assets.', status: 'planned', seoTitle: '', seoDescription: 'Storage setup notes for future media management.' },
    { id: 'feedback-product-reviews', group: 'feedback', title: 'Product reviews', path: 'reviews table', note: 'Not live yet. Needs a reviews table and moderation workflow.', status: 'needs backend', seoTitle: 'CaneCreme Reviews', seoDescription: 'Future moderated customer reviews for CaneCreme products.' },
    { id: 'feedback-current', group: 'feedback', title: 'Current feedback', path: 'orders and abandoned checkouts', note: 'Customer signals are available through orders and abandoned checkouts.', status: 'published', seoTitle: '', seoDescription: 'Admin reference for customer feedback signals.' },
    { id: 'seo-metadata', group: 'seo', title: 'Metadata', path: 'HTML head tags', note: 'Core SEO tags and sitemap are already added in code.', status: 'published', seoTitle: 'CaneCreme SEO Metadata', seoDescription: 'Default SEO metadata used across public CaneCreme pages.' },
    { id: 'seo-product', group: 'seo', title: 'Product SEO', path: 'product.html', note: 'Product pages dynamically use product name, description, image, price, and stock.', status: 'published', seoTitle: 'Dynamic Product SEO', seoDescription: 'Product detail pages inherit metadata from Supabase product records.' },
    { id: 'seo-admin-editing', group: 'seo', title: 'Admin editing', path: 'content drafts', note: 'Draft SEO fields can be edited here before publishing to code or a backend settings table.', status: 'draft', seoTitle: 'Editable Page SEO Drafts', seoDescription: 'Admin draft area for reviewing page-level SEO content before live publishing.' }
  ];
}

function getContentDrafts() {
  try {
    return JSON.parse(localStorage.getItem(CONTENT_DRAFTS_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveContentDrafts(drafts) {
  localStorage.setItem(CONTENT_DRAFTS_KEY, JSON.stringify(drafts));
}

function getContentItems() {
  const drafts = getContentDrafts();
  return getDefaultContentItems().map(item => ({
    ...item,
    ...(drafts[item.id] || {}),
    draftSaved: Boolean(drafts[item.id])
  }));
}

function renderContentGroup(containerId, group) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const items = getContentItems().filter(item => item.group === group);
  el.innerHTML = items.map(item => {
    const openAction = item.path && /\.html($|\?)/.test(item.path)
      ? `<button class="action-btn" type="button" onclick="openSitePage('${escapeHtml(item.path)}')">Open</button>`
      : '';
    return `
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.note)}</span>
        <small class="content-meta">${escapeHtml(item.path || 'No link')} - ${escapeHtml(item.status || 'draft')}</small>
        ${item.draftSaved ? '<span class="content-draft-badge">Draft saved</span>' : ''}
        <div class="content-item-actions">
          ${openAction}
          <button class="action-btn" type="button" onclick="openContentEditor('${escapeHtml(item.id)}')">Edit</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderContentTools() {
  renderContentGroup('content-pages-list', 'pages');
  renderContentGroup('content-media-list', 'media');
  renderContentGroup('content-feedback-list', 'feedback');
  renderContentGroup('content-seo-list', 'seo');
}

function openContentEditor(id) {
  const item = getContentItems().find(entry => entry.id === id);
  if (!item) return;
  const fieldMap = {
    'content-edit-id': item.id,
    'content-edit-title': item.title,
    'content-edit-path': item.path,
    'content-edit-note': item.note,
    'content-edit-status': item.status,
    'content-edit-seo-title': item.seoTitle,
    'content-edit-seo-description': item.seoDescription
  };
  Object.entries(fieldMap).forEach(([fieldId, value]) => {
    const el = document.getElementById(fieldId);
    if (el) el.value = value || '';
  });
  setText('content-modal-title', `Edit ${item.title}`);
  const overlay = document.getElementById('content-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeContentModal() {
  const overlay = document.getElementById('content-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function getContentEditorValues() {
  return {
    id: document.getElementById('content-edit-id')?.value || '',
    title: document.getElementById('content-edit-title')?.value.trim() || '',
    path: document.getElementById('content-edit-path')?.value.trim() || '',
    note: document.getElementById('content-edit-note')?.value.trim() || '',
    status: document.getElementById('content-edit-status')?.value || 'draft',
    seoTitle: document.getElementById('content-edit-seo-title')?.value.trim() || '',
    seoDescription: document.getElementById('content-edit-seo-description')?.value.trim() || ''
  };
}

function saveContentDraft() {
  const values = getContentEditorValues();
  if (!values.id || !values.title) {
    alert('Please add a title before saving this content draft.');
    return;
  }
  const drafts = getContentDrafts();
  drafts[values.id] = {
    title: values.title,
    path: values.path,
    note: values.note,
    status: values.status,
    seoTitle: values.seoTitle,
    seoDescription: values.seoDescription,
    updatedAt: new Date().toISOString()
  };
  saveContentDrafts(drafts);
  recordActivity('Saved content draft', values.title);
  closeContentModal();
  renderContentTools();
}

function resetContentDraft() {
  const id = document.getElementById('content-edit-id')?.value || '';
  if (!id) return;
  const drafts = getContentDrafts();
  const title = drafts[id]?.title || getDefaultContentItems().find(item => item.id === id)?.title || 'Content option';
  delete drafts[id];
  saveContentDrafts(drafts);
  recordActivity('Reset content draft', title);
  closeContentModal();
  renderContentTools();
}

function exportContentDrafts() {
  const drafts = getContentDrafts();
  const payload = {
    exported_at: new Date().toISOString(),
    note: 'Admin content drafts for CaneCreme. Live static pages still need HTML/config or backend publishing.',
    drafts,
    merged_content: getContentItems()
  };
  downloadJson(`canecreme-content-drafts-${getIndiaDateKey(new Date())}.json`, payload);
  recordActivity('Exported content drafts', `${Object.keys(drafts).length} saved drafts`);
}

function openSitePage(path) {
  window.open(path, '_blank', 'noopener');
}

function renderReports() {
  const validOrders = getValidOrders();
  const revenue = validOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const paidRevenue = validOrders
    .filter(order => normalizeOrderField(order.payment_status) === 'paid')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const aov = validOrders.length ? revenue / validOrders.length : 0;
  const customers = buildCustomerProfiles();
  const repeatCustomers = customers.filter(customer => customer.orderCount > 1).length;
  const recoveryValue = allAbandonedCheckouts.reduce((sum, checkout) => sum + Number(checkout.cart_total || 0), 0);

  setText('report-total-revenue', formatMoney(revenue));
  setText('report-aov', formatMoney(aov));
  setText('report-repeat-customers', String(repeatCustomers));
  setText('report-recovery-value', formatMoney(recoveryValue));

  const el = document.getElementById('reports-sales-list');
  if (!el) return;
  el.innerHTML = `
    <div class="dashboard-list-item"><div><strong>Paid revenue</strong><small>Online paid orders</small></div><span class="dashboard-list-value">${formatMoney(paidRevenue)}</span></div>
    <div class="dashboard-list-item"><div><strong>Total orders</strong><small>Valid orders only</small></div><span class="dashboard-list-value">${validOrders.length}</span></div>
    <div class="dashboard-list-item"><div><strong>Active COD orders</strong><small>Cash on delivery, valid only</small></div><span class="dashboard-list-value">${validOrders.filter(order => normalizeOrderField(order.payment_status) === 'cod' || normalizeOrderField(order.payment_method || order.shipping_address?.payment_method) === 'cod').length}</span></div>
    <div class="dashboard-list-item"><div><strong>Cancelled orders</strong><small>Separated from active fulfilment</small></div><span class="dashboard-list-value">${allOrders.filter(isCancelledOrder).length}</span></div>
    <div class="dashboard-list-item"><div><strong>Open abandoned checkouts</strong><small>Follow-up queue</small></div><span class="dashboard-list-value">${allAbandonedCheckouts.length}</span></div>
  `;
}

function getAdminSettings() {
  const defaults = {
    storeName: STORE_NAME || 'CaneCreme',
    storeEmail: STORE_EMAIL || 'canecreme@gmail.com',
    storePhone: STORE_PHONE || '9891239312',
    timezone: ADMIN_TIME_ZONE,
    clarityId: typeof CLARITY_PROJECT_ID !== 'undefined' ? CLARITY_PROJECT_ID : 'xv519kdgni'
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || '{}') };
  } catch (error) {
    return defaults;
  }
}

function loadAdminSettings() {
  const settings = getAdminSettings();
  const map = {
    'setting-store-name': settings.storeName,
    'setting-store-email': settings.storeEmail,
    'setting-store-phone': settings.storePhone,
    'setting-timezone': settings.timezone,
    'setting-clarity-id': settings.clarityId
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  });
}

function saveAdminSettings() {
  const settings = {
    storeName: document.getElementById('setting-store-name')?.value || '',
    storeEmail: document.getElementById('setting-store-email')?.value || '',
    storePhone: document.getElementById('setting-store-phone')?.value || '',
    timezone: document.getElementById('setting-timezone')?.value || ADMIN_TIME_ZONE,
    clarityId: document.getElementById('setting-clarity-id')?.value || ''
  };
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  recordActivity('Saved admin settings', 'Stored settings reference in this browser');
  alert('Settings saved in this browser. Update js/config.js for live website constants.');
}

function exportFullBackup() {
  loadActivityLogs();
  const payload = {
    exported_at: new Date().toISOString(),
    products: allProducts,
    orders: allOrders,
    customers: buildCustomerProfiles(),
    abandoned_checkouts: allAbandonedCheckouts,
    popup_leads: allLeads,
    settings_reference: getAdminSettings(),
    activity_logs: activityLogs
  };
  downloadJson(`canecreme-backup-${getIndiaDateKey(new Date())}.json`, payload);
  recordActivity('Downloaded backup', 'Exported products, orders, customers, abandoned checkouts, settings, and activity logs');
  updateBackupMetrics();
}

async function downloadFreshBackup() {
  const btn = document.getElementById('backup-download-btn');
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Preparing...';
  }

  try {
    await Promise.all([
      loadProducts(),
      loadOrders(),
      loadAbandonedCheckouts(),
      loadLeads()
    ]);
    exportFullBackup();
  } catch (error) {
    alert(`Backup could not be prepared: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Download Backup';
    }
  }
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
  renderDashboard();
  renderUserManagement();
  renderReports();
  renderDiscounts();
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
    if (activeAdminTab === 'dashboard' && !document.hidden) {
      refreshDashboard();
    }
    if (activeAdminTab === 'orders' && !document.hidden) {
      loadOrders();
    }
    if (activeAdminTab === 'abandoned' && !document.hidden) {
      loadAbandonedCheckouts();
    }
    if (activeAdminTab === 'leads' && !document.hidden) {
      loadLeads();
    }
    if (activeAdminTab === 'discounts' && !document.hidden) {
      loadDiscountSources();
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
  renderDashboard();
  renderReports();
  renderDiscounts();
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

function buildRecoveryWhatsappMessage(checkout) {
  const offer = checkout.recovery_offer;
  const name = checkout.customer_name || 'there';
  const checkoutLink = getRecoveryLink(checkout);
  const expiresText = offer?.expires_at ? new Date(offer.expires_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: ADMIN_TIME_ZONE
  }) : 'the next 24 hours';
  const lines = [
    `Hi ${name},`,
    '',
    'You left a few items in your cart at Cane Creme.',
    '',
    offer?.offer_type === 'none'
      ? 'We would be happy to help you complete your order.'
      : `Here is a special offer just for you: ${offer?.offer_label || 'Cane Creme offer'}`,
  ];

  if (offer?.offer_type && offer.offer_type !== 'none' && offer.coupon_code) {
    lines.push('', `Use code: ${offer.coupon_code}`, `Valid until: ${expiresText}`);
  }

  lines.push('', 'Complete your order here:', checkoutLink, '', 'Thank you,', 'Cane Creme');
  return lines.join('\n');
}

function buildRecoveryWhatsappUrl(checkout) {
  const phone = normalizeWhatsappPhone(checkout.customer_phone);
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildRecoveryWhatsappMessage(checkout))}`;
}

function getAbandonedCheckoutById(checkoutId) {
  return allAbandonedCheckouts.find(checkout => String(checkout.id) === String(checkoutId));
}

function renderRecoveryOfferResult(checkout) {
  const result = document.getElementById('abandoned-offer-result');
  const whatsappBtn = document.getElementById('recovery-whatsapp-btn');
  const contactedBtn = document.getElementById('recovery-contacted-btn');
  if (!result) return;

  const offer = checkout?.recovery_offer;
  if (!offer) {
    result.innerHTML = '<p class="admin-note">Select an offer to generate a one-time recovery coupon.</p>';
    if (whatsappBtn) whatsappBtn.disabled = true;
    if (contactedBtn) contactedBtn.disabled = true;
    return;
  }

  const expiry = offer.expires_at ? new Date(offer.expires_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: ADMIN_TIME_ZONE
  }) : '24 hours';
  const couponLine = offer.offer_type === 'none'
    ? '<strong>No coupon code needed</strong>'
    : `<strong>${escapeHtml(offer.coupon_code)}</strong>`;

  result.innerHTML = `
    <div class="recovery-coupon-card">
      <span>${escapeHtml(offer.offer_label || 'Recovery offer')}</span>
      ${couponLine}
      <small>Expires: ${escapeHtml(expiry)}</small>
      <small>Link: <a href="${escapeHtml(getRecoveryLink(checkout))}" target="_blank" rel="noopener">${escapeHtml(getRecoveryLink(checkout))}</a></small>
    </div>
  `;
  if (whatsappBtn) whatsappBtn.disabled = !normalizeWhatsappPhone(checkout.customer_phone);
  if (contactedBtn) contactedBtn.disabled = false;
}

function openAbandonedOfferModal(checkoutId) {
  const checkout = getAbandonedCheckoutById(checkoutId);
  if (!checkout) return;

  document.getElementById('abandoned-offer-checkout-id').value = checkout.id;
  const details = document.getElementById('abandoned-offer-details');
  if (details) {
    details.innerHTML = `
      <div>
        <span>Customer</span>
        <strong>${escapeHtml(checkout.customer_name || 'Checkout visitor')}</strong>
      </div>
      <div>
        <span>WhatsApp</span>
        <strong>${escapeHtml(checkout.customer_phone || 'No phone saved')}</strong>
      </div>
      <div>
        <span>Cart Value</span>
        <strong>${formatMoney(checkout.cart_total)}</strong>
      </div>
      <div>
        <span>Cart Items</span>
        <strong>${escapeHtml(getCheckoutItemsSummary(checkout).join(', ') || 'Cart details saved')}</strong>
      </div>
      <div class="recovery-link-row">
        <span>Recovery Link</span>
        <strong><a href="${escapeHtml(getRecoveryLink(checkout))}" target="_blank" rel="noopener">${escapeHtml(getRecoveryLink(checkout))}</a></strong>
      </div>
    `;
  }
  renderRecoveryOfferResult(checkout);
  document.getElementById('abandoned-offer-modal-overlay').style.display = 'flex';
}

function closeAbandonedOfferModal() {
  const modal = document.getElementById('abandoned-offer-modal-overlay');
  if (modal) modal.style.display = 'none';
}

async function createRecoveryOffer(offerKey) {
  const checkoutId = document.getElementById('abandoned-offer-checkout-id')?.value;
  if (!checkoutId) return;
  const result = document.getElementById('abandoned-offer-result');
  if (result) result.innerHTML = '<p class="admin-note">Generating offer...</p>';

  try {
    const data = await callAbandonedCheckouts('create_offer', { checkout_id: checkoutId, offer_key: offerKey });
    const index = allAbandonedCheckouts.findIndex(checkout => String(checkout.id) === String(checkoutId));
    if (index >= 0) {
      allAbandonedCheckouts[index] = {
        ...allAbandonedCheckouts[index],
        recovery_status: 'offer_created',
        recovery_offer: data.offer || allAbandonedCheckouts[index].recovery_offer,
        checkout_link: data.checkout_link || allAbandonedCheckouts[index].checkout_link
      };
      renderRecoveryOfferResult(allAbandonedCheckouts[index]);
    }
    updateAbandonedMetrics();
    renderAbandonedCheckouts();
  } catch (error) {
    if (result) result.innerHTML = `<p class="error-msg" style="display:block;">${escapeHtml(error.message)}</p>`;
  }
}

async function openRecoveryWhatsapp(checkoutId) {
  const checkout = getAbandonedCheckoutById(checkoutId);
  if (!checkout) return;
  const url = buildRecoveryWhatsappUrl(checkout);
  if (!url) {
    alert('A valid WhatsApp number is required before opening WhatsApp.');
    return;
  }
  await callAbandonedCheckouts('mark_whatsapp_opened', { checkout_id: checkoutId }).catch(err => console.warn(err.message));
  checkout.recovery_status = 'whatsapp_opened';
  if (checkout.recovery_offer) checkout.recovery_offer.status = 'whatsapp_opened';
  updateAbandonedMetrics();
  renderAbandonedCheckouts();
  window.open(url, '_blank', 'noopener');
}

function openRecoveryWhatsappFromModal() {
  const checkoutId = document.getElementById('abandoned-offer-checkout-id')?.value;
  if (checkoutId) openRecoveryWhatsapp(checkoutId);
}

async function markRecoveryContacted(checkoutId) {
  const checkout = getAbandonedCheckoutById(checkoutId);
  if (!checkout) return;
  await callAbandonedCheckouts('mark_contacted', { checkout_id: checkoutId });
  checkout.recovery_status = 'contacted';
  if (checkout.recovery_offer) checkout.recovery_offer.status = 'contacted';
  updateAbandonedMetrics();
  renderAbandonedCheckouts();
  renderRecoveryOfferResult(checkout);
}

function markRecoveryContactedFromModal() {
  const checkoutId = document.getElementById('abandoned-offer-checkout-id')?.value;
  if (checkoutId) markRecoveryContacted(checkoutId).catch(error => alert(error.message));
}

function renderAbandonedCheckouts() {
  const tbody = document.getElementById('abandoned-table-body');
  if (!tbody) return;

  const checkouts = getFilteredAbandonedCheckouts();

  if (allAbandonedCheckouts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b6b6b;">No abandoned checkouts yet.</td></tr>';
    return;
  }

  if (checkouts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b6b6b;">No abandoned checkouts match these filters.</td></tr>';
    return;
  }

  tbody.innerHTML = checkouts.map(checkout => {
    const items = getCheckoutItemNames(checkout);
    const address = getCheckoutAddressText(checkout);
    const lastStep = String(checkout.last_step || 'checkout_started').replace(/_/g, ' ');
    const recoveryStatus = getRecoveryStatus(checkout);
    const offer = checkout.recovery_offer;

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
        <td>
          <span class="status-badge ${getRecoveryStatusClass(recoveryStatus)}">${escapeHtml(getRecoveryStatusLabel(recoveryStatus))}</span>
          ${offer ? `<small>${escapeHtml(offer.offer_label || '')}${offer.coupon_code && offer.offer_type !== 'none' ? ` · ${escapeHtml(offer.coupon_code)}` : ''}</small>` : '<small>No offer yet</small>'}
        </td>
        <td>${escapeHtml(getCheckoutDate(checkout))}</td>
        <td>${escapeHtml(items.join(', ') || 'Cart details saved')}</td>
        <td class="abandoned-actions">
          <button class="action-btn warning" onclick="openAbandonedOfferModal('${checkout.id}')">Send Offer</button>
          ${offer ? `<button class="action-btn abandoned-whatsapp" onclick="openRecoveryWhatsapp('${checkout.id}')">Send on WhatsApp</button>` : ''}
          <button class="action-btn" onclick="closeAbandonedCheckout('${checkout.id}')">Close</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function closeAbandonedCheckout(checkoutId) {
  if (!confirm('Close this abandoned checkout after follow-up?')) return;
  await callAbandonedCheckouts('close', { checkout_id: checkoutId });
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
  const btn = document.getElementById('order-status-update-btn');
  const originalText = btn ? btn.textContent : '';

  if (!currentOrderId) {
    setRapidShypResult('Open an order first.', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating...';
  }
  setRapidShypResult(`Updating order status to ${status}...`, 'info');

  try {
    await callAdminOrders('update_status', { order_id: currentOrderId, order_status: status });
    setRapidShypResult(`Order status updated to ${status}.`, 'success');
    loadOrders();
  } catch (error) {
    setRapidShypResult(error instanceof Error ? error.message : 'Order status could not be updated.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || 'Update';
    }
  }
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
    loadOrders();
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
