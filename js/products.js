// ===== PRODUCTS — Load from Supabase =====

async function fetchProducts(limit = 100) {
  try {
    let url = `${SUPABASE_URL}/rest/v1/products?is_active=eq.true&order=created_at.desc`;
    if (limit < 100) url += `&limit=${limit}`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) throw new Error('Failed to fetch products');
    return await res.json();
  } catch (err) {
    console.error('Error fetching products:', err);
    return [];
  }
}

function renderStars(rating) {
  const r = Math.round(parseFloat(rating) || 5);
  return Array.from({length: 5}, (_, i) =>
    `<span class="${i < r ? '' : 'star-empty'}">★</span>`
  ).join('');
}

function renderProductCard(product) {
  const imageHtml = (product.images && product.images.length > 0)
    ? `<div class="product-image"><img src="${product.images[0]}" alt="${product.name}" loading="lazy" onerror="this.parentElement.innerHTML='🌿'" /></div>`
    : `<div class="product-image">🌿</div>`;

  const hasSale = product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price);
  const badge   = hasSale
    ? `<div class="product-badge">Sale</div>`
    : `<div class="product-badge new-badge">New</div>`;

  const comparePrice = hasSale
    ? `<span class="product-compare-price">₹${parseFloat(product.compare_at_price).toFixed(0)}</span>`
    : '';

  const inStock = product.stock === undefined || product.stock > 0;

  const actionHtml = inStock
    ? `<button class="add-to-cart" onclick='addToCart(${JSON.stringify({
        id:    product.id,
        name:  product.name,
        price: product.price,
        image: (product.images && product.images[0]) || null
      })})'>Add to Cart</button>`
    : `<span class="out-of-stock-label">Out of Stock</span>`;

  return `
    <div class="product-card">
      ${imageHtml}
      ${badge}
      <div class="product-info">
        <div class="product-stock">${inStock ? 'In Stock' : 'Out of Stock'}</div>
        <div class="product-stars">${renderStars(product.rating || 5)}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-desc">${product.description || ''}</div>
        <div class="product-footer">
          <div class="price-wrap">
            <span class="product-price">₹${parseFloat(product.price).toFixed(0)}</span>
            ${comparePrice}
          </div>
          ${actionHtml}
        </div>
      </div>
    </div>
  `;
}

async function loadFeaturedProducts(containerId, limit = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const products = await fetchProducts(limit);

  if (products.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:5rem 2rem;color:var(--gray);">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🌿</div>
        <p style="font-size:1rem;margin-bottom:0.5rem;color:var(--dark);">No products yet</p>
        <a href="admin.html" style="color:var(--green);font-weight:500;font-size:0.9rem;">Add your first product in Admin →</a>
      </div>`;
    return;
  }

  container.innerHTML = products.map(renderProductCard).join('');

  // Trigger stagger animation if main.js loaded
  if (typeof window.onProductsLoaded === 'function') {
    window.onProductsLoaded();
  }

  // Update product count on shop page
  const countEl = document.getElementById('product-count');
  if (countEl) {
    countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''}`;
  }
}
