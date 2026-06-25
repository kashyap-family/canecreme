// ===== ADMIN PANEL =====

let currentOrderId = null;
let allOrders = [];

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

function getOrderDate(order) {
  const date = new Date(order.created_at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isWithinDateFilter(order, filterValue) {
  if (filterValue === 'all') return true;
  const created = new Date(order.created_at);
  if (Number.isNaN(created.getTime())) return false;
  const now = new Date();

  if (filterValue === 'today') {
    return created.toDateString() === now.toDateString();
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

function getFilteredOrders() {
  const search = (document.getElementById('order-search')?.value || '').trim().toLowerCase();
  const payment = document.getElementById('payment-filter')?.value || 'all';
  const status = document.getElementById('status-filter')?.value || 'all';
  const date = document.getElementById('date-filter')?.value || 'all';

  return allOrders.filter(order => {
    const matchesSearch = !search || getOrderSearchText(order).includes(search);
    const matchesPayment = payment === 'all' || order.payment_status === payment;
    const matchesStatus = status === 'all' || order.order_status === status;
    const matchesDate = isWithinDateFilter(order, date);
    return matchesSearch && matchesPayment && matchesStatus && matchesDate;
  });
}

function updateOrderMetrics() {
  const total = allOrders.length;
  const pending = allOrders.filter(order => ['new', 'processing'].includes(order.order_status)).length;
  const cod = allOrders.filter(order => order.payment_status === 'cod').length;
  const paidRevenue = allOrders
    .filter(order => order.payment_status === 'paid')
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
});

// ===== TABS =====
function showTab(tab) {
  document.getElementById('tab-products-content').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tab-orders-content').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tab-products').classList.toggle('active', tab === 'products');
  document.getElementById('tab-orders').classList.toggle('active', tab === 'orders');
  if (tab === 'orders') loadOrders();
  if (tab === 'products') loadProducts();
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
  const tbody = document.getElementById('orders-table-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;">Loading...</td></tr>';

  try {
    const data = await callAdminOrders('list');
    allOrders = Array.isArray(data.orders) ? data.orders : [];
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#dc2626;">${error.message}</td></tr>`;
    return;
  }

  updateOrderMetrics();
  renderOrders();
}

function renderOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  const orders = getFilteredOrders();

  if (allOrders.length === 0) {
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
