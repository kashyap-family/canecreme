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
  let imageHtml;
  if (product.images && product.images.length > 1) {
    const slides = product.images.map((src) =>
      `<img src="${src}" alt="${product.name}" class="carousel-slide" loading="lazy" onerror="this.style.display='none'" />`
    ).join('');
    const dots = product.images.map((_, i) =>
      `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="event.stopPropagation();carouselGo(this,${i})" aria-label="Image ${i+1}"></button>`
    ).join('');
    imageHtml = `<div class="product-image carousel"><div class="carousel-track">${slides}</div><div class="carousel-dots">${dots}</div></div>`;
  } else if (product.images && product.images.length === 1) {
    imageHtml = `<div class="product-image"><img src="${product.images[0]}" alt="${product.name}" loading="lazy" onerror="this.parentElement.innerHTML='🌿'" /></div>`;
  } else {
    imageHtml = `<div class="product-image product-image-empty">🌿</div>`;
  }

  const hasSale = product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price);
  const bestsellerNames = ['beet', 'soya', 'powerbite'];
  const isBestseller = bestsellerNames.some(n => product.name.toLowerCase().includes(n));
  const badge = isBestseller
    ? `<div class="product-badge bestseller-badge">⭐ Bestseller</div>`
    : hasSale
    ? `<div class="product-badge">Sale</div>`
    : `<div class="product-badge new-badge">New</div>`;

  const comparePrice = hasSale
    ? `<span class="product-compare-price">₹${parseFloat(product.compare_at_price).toFixed(0)}</span>`
    : '';

  const inStock = product.stock === undefined || product.stock > 0;

  const actionHtml = inStock
    ? `<button class="add-to-cart" onclick='event.stopPropagation();addToCart(${JSON.stringify({
        id:    product.id,
        name:  product.name,
        price: product.price,
        image: (product.images && product.images[0]) || null
      })})'>Add to Cart</button>`
    : `<span class="out-of-stock-label">Out of Stock</span>`;

  return `
    <div class="product-card" onclick="window.location.href='product.html?id=${product.id}'" style="cursor:pointer;">
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

function carouselGo(dotEl, index) {
  const card = dotEl.closest('.product-image');
  card.querySelector('.carousel-track').style.transform = `translateX(-${index * 100}%)`;
  card.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

function carouselSetIndex(card, index) {
  const dots = card.querySelectorAll('.carousel-dot');
  const total = dots.length;
  if (!total) return;
  const nextIndex = ((index % total) + total) % total;
  card.querySelector('.carousel-track').style.transform = `translateX(-${nextIndex * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === nextIndex));
}

function carouselGetIndex(card) {
  return Array.from(card.querySelectorAll('.carousel-dot')).findIndex(dot => dot.classList.contains('active'));
}

function initCarouselHover() {
  document.querySelectorAll('.product-image.carousel').forEach(card => {
    const total = card.querySelectorAll('.carousel-slide').length;
    if (total < 2) return;
    let timer = null;
    let current = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let didSwipe = false;
    let suppressClick = false;

    const syncCurrent = () => {
      const activeIndex = carouselGetIndex(card);
      current = activeIndex >= 0 ? activeIndex : current;
      return current;
    };

    const showNext = (delta = 1) => {
      current = syncCurrent() + delta;
      carouselSetIndex(card, current);
    };

    card.addEventListener('mouseenter', () => {
      timer = setInterval(() => {
        showNext(1);
      }, 900);
    });

    card.addEventListener('mouseleave', () => {
      clearInterval(timer);
      timer = null;
      current = 0;
      carouselSetIndex(card, 0);
    });

    card.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      didSwipe = false;
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        didSwipe = true;
        e.preventDefault();
      }
    }, { passive: false });

    card.addEventListener('touchend', (e) => {
      if (!didSwipe) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        e.stopPropagation();
        suppressClick = true;
        showNext(dx < 0 ? 1 : -1);
        window.setTimeout(() => { suppressClick = false; }, 250);
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.carousel-dot')) return;
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      e.stopPropagation();
      if (!suppressClick) showNext(1);
      suppressClick = false;
    });
  });
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

  initCarouselHover();

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
