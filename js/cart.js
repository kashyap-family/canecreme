// ===== CART MANAGEMENT =====

let cart = JSON.parse(localStorage.getItem('canecreme_cart') || '[]');

function saveCart() {
  localStorage.setItem('canecreme_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }
  saveCart();
  openCart();
  showToast(product.name + ' added to cart!');
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCart();
}

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) removeFromCart(productId);
    else saveCart();
  }
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartUI() {
  // Update count badge
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = getCartCount();

  // Update total
  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = getCartTotal().toFixed(2);

  // Render items
  const itemsEl = document.getElementById('cart-items');
  if (!itemsEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="empty-cart"><p>Your cart is empty</p><a href="shop.html">Browse products →</a></div>';
    return;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" />` : '🌿'}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${(item.price * item.quantity).toFixed(2)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">−</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
        </div>
      </div>
      <span class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</span>
    </div>
  `).join('');
}

function openCart() {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closeCart() {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: #2d5016; color: white; padding: 0.75rem 1.5rem;
    border-radius: 8px; font-size: 0.9rem; z-index: 999;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();

  const cartIcon = document.getElementById('cart-icon');
  if (cartIcon) cartIcon.addEventListener('click', e => { e.preventDefault(); openCart(); });

  const cartClose = document.getElementById('cart-close');
  if (cartClose) cartClose.addEventListener('click', closeCart);

  const overlay = document.getElementById('cart-overlay');
  if (overlay) overlay.addEventListener('click', closeCart);
});
