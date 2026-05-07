// ===== ADMIN PANEL =====

let currentOrderId = null;

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
    is_active: document.getElementById('p-active').checked
  };

  const url = id
    ? `${SUPABASE_URL}/rest/v1/products?id=eq.${id}`
    : `${SUPABASE_URL}/rest/v1/products`;

  const res = await fetch(url, {
    method: id ? 'PATCH' : 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeProductModal();
    loadProducts();
  } else {
    errorEl.textContent = 'Error saving product. Please try again.';
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

  const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const orders = await res.json();

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b6b6b;">No orders yet.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><code style="font-size:0.78rem;">${o.id.slice(0,8)}...</code></td>
      <td>${o.customer_name}</td>
      <td>${o.customer_email}</td>
      <td>₹${parseFloat(o.total_amount).toFixed(2)}</td>
      <td><span class="status-badge status-${o.payment_status}">${o.payment_status}</span></td>
      <td><span class="status-badge status-${o.order_status}">${o.order_status}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
      <td><button class="action-btn" onclick="openOrderModal('${o.id}')">View</button></td>
    </tr>
  `).join('');
}

async function openOrderModal(orderId) {
  currentOrderId = orderId;

  const [orderRes, itemsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=*,products(name,price)`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    })
  ]);

  const [orders, items] = await Promise.all([orderRes.json(), itemsRes.json()]);
  const order = orders[0];
  const addr = order.shipping_address;

  document.getElementById('order-status-select').value = order.order_status;

  document.getElementById('order-detail-content').innerHTML = `
    <div class="order-detail-grid">
      <div class="order-detail-section">
        <h4>Customer</h4>
        <p>${order.customer_name}<br/>${order.customer_email}<br/>${order.customer_phone || ''}</p>
      </div>
      <div class="order-detail-section">
        <h4>Shipping Address</h4>
        <p>${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}<br/>${addr.city}, ${addr.state} ${addr.pin}<br/>${addr.country}</p>
      </div>
      <div class="order-detail-section">
        <h4>Payment</h4>
        <p>Status: ${order.payment_status}<br/>ID: ${order.payment_id || 'N/A'}</p>
      </div>
      <div class="order-detail-section">
        <h4>Order Total</h4>
        <p style="font-size:1.3rem;font-weight:600;color:#2d5016;">₹${parseFloat(order.total_amount).toFixed(2)}</p>
      </div>
    </div>
    <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;margin-bottom:0.75rem;font-weight:600;">Items Ordered</h4>
    <table class="order-items-table">
      <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.products ? item.products.name : 'Product'}</td>
            <td>${item.quantity}</td>
            <td>₹${parseFloat(item.price).toFixed(2)}</td>
            <td>₹${(item.price * item.quantity).toFixed(2)}</td>
          </tr>
        `).join('')}
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
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${currentOrderId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order_status: status })
  });
  closeOrderModal();
  loadOrders();
}
