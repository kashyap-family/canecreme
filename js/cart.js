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
  showToast(`${product.name} added to cart`);
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
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = getCartCount();

  const totalEl = document.getElementById('cart-total');
  if (totalEl) totalEl.textContent = getCartTotal().toFixed(0);

  const itemsEl = document.getElementById('cart-items');
  if (!itemsEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">🛍️</div>
        <p>Your cart is empty</p>
        <a href="shop.html">Browse products →</a>
      </div>`;
    return;
  }

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.image
          ? `<img src="${item.image}" alt="${item.name}" />`
          : '🌿'}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${(item.price * item.quantity).toFixed(0)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">−</button>
          <span class="qty-num">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
        </div>
      </div>
      <span class="cart-item-remove" onclick="removeFromCart('${item.id}')" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </span>
    </div>
  `).join('');
}

function openCart() {
  document.getElementById('cart-sidebar')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-sidebar')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function showToast(message) {
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `
    position:fixed; bottom:2rem; left:50%; transform:translateX(-50%) translateY(8px);
    background:var(--dark); color:white; padding:0.75rem 1.5rem;
    border-radius:6px; font-size:0.875rem; z-index:999;
    opacity:0; transition:opacity 0.25s ease, transform 0.25s ease;
    font-family:var(--font-body); box-shadow:0 4px 20px rgba(0,0,0,0.2);
    white-space:nowrap;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2400);
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();

  document.getElementById('cart-icon')
    ?.addEventListener('click', e => { e.preventDefault(); openCart(); });
  document.getElementById('cart-close')
    ?.addEventListener('click', closeCart);
  document.getElementById('cart-overlay')
    ?.addEventListener('click', closeCart);

  // Close cart on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCart();
  });
});
