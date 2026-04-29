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

function renderProductCard(product) {
  const imageHtml = (product.images && product.images.length > 0)
    ? `<div class="product-image"><img src="${product.images[0]}" alt="${product.name}" onerror="this.parentElement.innerHTML='🌿'" /></div>`
    : `<div class="product-image" style="background:#e8f5e0;">🌿</div>`;

  const comparePrice = product.compare_at_price
    ? `<span class="product-compare-price">₹${parseFloat(product.compare_at_price).toFixed(2)}</span>`
    : '';

  const stockBadge = product.stock === 0
    ? `<span style="color:#e53e3e;font-size:0.8rem;">Out of Stock</span>`
    : `<button class="add-to-cart" onclick='addToCart(${JSON.stringify({
        id: product.id,
        name: product.name,
        price: product.price,
        image: (product.images && product.images[0]) || null
      })})'>Add to Cart</button>`;

  return `
    <div class="product-card">
      ${imageHtml}
      <div class="product-info">
        <div class="product-name">${product.name}</div>
        <div class="product-desc">${product.description || ''}</div>
        <div class="product-footer">
          <div>
            <span class="product-price">₹${parseFloat(product.price).toFixed(2)}</span>
            ${comparePrice}
          </div>
          ${stockBadge}
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
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#6b6b6b;">
        <p>No products yet. <a href="admin.html" style="color:#2d5016;">Add your first product →</a></p>
      </div>`;
    return;
  }

  container.innerHTML = products.map(renderProductCard).join('');
}
