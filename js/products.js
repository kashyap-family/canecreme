// ===== PRODUCTS — Load from Supabase =====

const BESTSELLER_KEYWORDS = ['beet', 'soya', 'powerbite', 'banana tea cake', 'dry fruit tea cake'];

const PRODUCT_IMAGE_OVERRIDES = [
  {
    match: 'powerbite',
    images: [
      'Assets/Cookies/powerbite/powerbite-1.jpg',
      'Assets/Cookies/powerbite/powerbite-2.jpg',
      'Assets/Cookies/powerbite/powerbite-3.jpg',
      'Assets/Cookies/powerbite/powerbite-4.jpg'
    ]
  },
  {
    match: 'chocochip',
    images: [
      'Assets/Cookies/chocochip/chocochip-1.jpg',
      'Assets/Cookies/chocochip/chocochip-2.jpg',
      'Assets/Cookies/chocochip/chocochip-3.jpg',
      'Assets/Cookies/chocochip/chocochip-4.jpg'
    ]
  },
  {
    match: 'millet royale',
    images: [
      'Assets/Cookies/Millet royale/Millet-Royale-1.jpeg?v=2',
      'Assets/Cookies/Millet royale/Millet-Royale-2.jpeg?v=2',
      'Assets/Cookies/Millet royale/Millet-Royale-3.jpeg?v=2',
      'Assets/Cookies/Millet royale/Millet-Royale-4.jpeg?v=2'
    ]
  },
  {
    match: 'tropical cookies',
    images: [
      'Assets/Cookies/Tropical cookies/Tropical-Cookies-1.jpeg?v=2',
      'Assets/Cookies/Tropical cookies/Tropical-Cookies-2.jpeg?v=2',
      'Assets/Cookies/Tropical cookies/Tropical-Cookies-3.jpeg?v=2',
      'Assets/Cookies/Tropical cookies/Tropical-Cookies-4.jpeg?v=2'
    ]
  },
  {
    match: 'atta cookies',
    images: [
      'Assets/Cookies/atta cookies/atta-cookies-1.jpeg',
      'Assets/Cookies/atta cookies/atta-cookies-2.jpg',
      'Assets/Cookies/atta cookies/atta-cookies-3.jpg',
      'Assets/Cookies/atta cookies/atta-cookies-4.jpg'
    ]
  },
  {
    match: 'corn cheese',
    images: [
      'Assets/Chips/Corn cheese chips/Corn-cheese-1.jpeg?v=2',
      'Assets/Chips/Corn cheese chips/Corn-cheese-2.jpeg?v=2',
      'Assets/Chips/Corn cheese chips/Corn-cheese-3.jpeg?v=2',
      'Assets/Chips/Corn cheese chips/Corn-cheese-4.jpeg?v=2',
      'Assets/Chips/Corn cheese chips/Corn-cheese-5.jpeg?v=2'
    ]
  },
  {
    match: 'korean chilli',
    images: [
      'Assets/Chips/Korean chilli chips/Korean-chilli-1.jpeg?v=2',
      'Assets/Chips/Korean chilli chips/Korean-chilli-2.jpeg?v=2',
      'Assets/Chips/Korean chilli chips/Korean-chilli-3.jpeg?v=2',
      'Assets/Chips/Korean chilli chips/Korean-chilli-4.jpeg?v=2',
      'Assets/Chips/Korean chilli chips/Korean-chilli-5.jpeg?v=2'
    ]
  },
  {
    match: 'pudina crunch',
    images: [
      'Assets/Chips/Pudina crunch/Pudina-crunch-1.jpeg?v=2',
      'Assets/Chips/Pudina crunch/Pudina-crunch-2.jpeg?v=2',
      'Assets/Chips/Pudina crunch/Pudina-crunch-3.jpeg?v=2',
      'Assets/Chips/Pudina crunch/Pudina-crunch-4.jpeg?v=2',
      'Assets/Chips/Pudina crunch/Pudina-crunch-5.jpeg?v=2'
    ]
  },
  {
    match: 'makhana chips',
    images: [
      'Assets/Makhana/makhana chips/Makhana-chips-1.jpeg?v=2',
      'Assets/Makhana/makhana chips/Makhana-chips-2.jpeg?v=2',
      'Assets/Makhana/makhana chips/Makhana-chips-3.jpeg?v=2',
      'Assets/Makhana/makhana chips/Makhana-chips-4.jpeg?v=2'
    ]
  },
  {
    match: 'peri pop',
    images: [
      'Assets/Makhana/Peri pop/Peri-pop-1.jpeg?v=2',
      'Assets/Makhana/Peri pop/Peri-pop-2.jpeg?v=2',
      'Assets/Makhana/Peri pop/Peri-pop-3.jpeg?v=2',
      'Assets/Makhana/Peri pop/Peri-pop-4.jpeg?v=2',
      'Assets/Makhana/Peri pop/Peri-pop-5.jpeg?v=2'
    ]
  },
  {
    match: 'pudina pop',
    images: [
      'Assets/Makhana/pudina pop/Pudina-pop-1.jpeg?v=2',
      'Assets/Makhana/pudina pop/Pudina-pop-2.jpeg?v=2',
      'Assets/Makhana/pudina pop/Pudina-pop-3.jpeg?v=2',
      'Assets/Makhana/pudina pop/Pudina-pop-4.jpeg?v=2',
      'Assets/Makhana/pudina pop/Pudina-pop-5.jpeg?v=2'
    ]
  },
  {
    match: 'protein laddoo',
    images: [
      'Assets/Gift Hamper/Laddoo (12 pc pack)/Protein-laddoos-1.jpeg',
      'Assets/Gift Hamper/Laddoo (12 pc pack)/Protein-laddoos-2.jpg',
      'Assets/Gift Hamper/Laddoo (12 pc pack)/Protein-laddoos-3.jpeg'
    ]
  },
  {
    match: 'beet bites',
    images: [
      'Assets/Chips/beet bites/beet-bites-1.jpeg',
      'Assets/Chips/beet bites/beet-bites-2.jpg',
      'Assets/Chips/beet bites/beet-bites-3.jpg',
      'Assets/Chips/beet bites/beet-bites-4.jpg'
    ]
  },
  {
    match: 'broccoli bites',
    images: [
      'Assets/Chips/broccoli bites/broccoli-bites-1.jpeg',
      'Assets/Chips/broccoli bites/broccoli-bites-2.jpg',
      'Assets/Chips/broccoli bites/broccoli-bites-3.jpg',
      'Assets/Chips/broccoli bites/broccoli-bites-4.jpg'
    ]
  },
  {
    match: 'soya bites',
    images: [
      'Assets/Chips/soya bites/soya-bites-1.jpeg',
      'Assets/Chips/soya bites/soya-bites-2.jpg',
      'Assets/Chips/soya bites/soya-bites-3.jpg',
      'Assets/Chips/soya bites/soya-bites-4.jpg'
    ]
  }
];

const RAKHI_STOREFRONT_KEYWORDS = [
  'rakhi',
  'mini hamper',
  'classic hamper',
  'jumbo hamper',
  'chocolate celebration',
  'belgium indulgence',
  'signature celebration'
];

function isRakhiStoreProduct(product = {}) {
  const category = String(product.category || '').toLowerCase();
  const name = String(product.name || '').toLowerCase();
  const imageText = Array.isArray(product.images) ? product.images.join(' ').toLowerCase() : '';

  return category === 'rakhi'
    || category.includes('rakhi')
    || imageText.includes('rakhi')
    || RAKHI_STOREFRONT_KEYWORDS.some(keyword => name.includes(keyword));
}

function applyProductImageOverrides(product = {}) {
  const name = String(product.name || '').toLowerCase();
  const override = PRODUCT_IMAGE_OVERRIDES.find(item => name.includes(item.match));
  return override ? { ...product, images: override.images.slice() } : product;
}

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
    const products = await res.json();
    return products.map(applyProductImageOverrides);
  } catch (err) {
    console.error('Error fetching products:', err);
    return [];
  }
}

function renderStars(rating) {
  if (rating === undefined || rating === null || rating === '') return '';
  const parsed = parseFloat(rating);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  const r = Math.round(parsed);
  return Array.from({length: 5}, (_, i) =>
    `<span class="${i < r ? '' : 'star-empty'}">★</span>`
  ).join('');
}

function getProductVariantInfo(product) {
  const match = String(product.name || '').match(/^(.*?)\s+-\s+([0-9]+(?:\.[0-9]+)?\s*(?:g|gm|kg|ml|l))$/i);
  if (!match) return null;
  const size = match[2].replace(/\s+/g, '').toLowerCase();
  const numeric = parseFloat(size);
  const unit = size.replace(/[0-9.]/g, '');
  const grams = unit === 'kg' ? numeric * 1000 : numeric;
  return {
    baseName: match[1].trim(),
    sizeLabel: size.replace(/^([0-9.]+)([a-z]+)$/i, '$1$2'),
    sortValue: Number.isFinite(grams) ? grams : 0
  };
}

function groupProductVariants(products) {
  const groups = new Map();
  const singles = [];

  products.forEach(product => {
    const variant = getProductVariantInfo(product);
    if (!variant) {
      singles.push(product);
      return;
    }

    const key = variant.baseName.toLowerCase();
    if (!groups.has(key)) groups.set(key, { baseName: variant.baseName, items: [] });
    groups.get(key).items.push({ ...product, variant });
  });

  groups.forEach(group => {
    group.items.sort((a, b) => a.variant.sortValue - b.variant.sortValue);
    const first = group.items[0];
    singles.push({
      ...first,
      name: group.baseName,
      price: first.price,
      compare_at_price: first.compare_at_price,
      stock: group.items.reduce((sum, item) => sum + (parseInt(item.stock, 10) || 0), 0),
      variants: group.items,
      variant_count: group.items.length
    });
  });

  return singles.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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
  const productName = String(product.name || '');
  const isBestseller = BESTSELLER_KEYWORDS.some(n => productName.toLowerCase().includes(n));
  const badge = isBestseller
    ? `<div class="product-badge bestseller-badge">⭐ Bestseller</div>`
    : hasSale
    ? ''
    : `<div class="product-badge new-badge">New</div>`;

  const comparePrice = hasSale
    ? `<span class="product-compare-price">₹${parseFloat(product.compare_at_price).toFixed(0)}</span>`
    : '';
  const discount = hasSale
    ? `<span class="product-discount">${Math.round(((parseFloat(product.compare_at_price) - parseFloat(product.price)) / parseFloat(product.compare_at_price)) * 100)}% off</span>`
    : '';
  const stars = renderStars(product.rating);
  const reviewText = product.review_count ? ` <span class="product-review-count">(${parseInt(product.review_count, 10)})</span>` : '';
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 1;
  const benefitTags = [
    product.delivery_type === 'delhi_only' ? 'Delhi/NCR delivery' : 'Pan India delivery',
    isBestseller ? 'Customer favourite' : '',
    hasVariants ? `${product.variant_count} sizes` : ''
  ].filter(Boolean).slice(0, 2);

  const inStock = product.stock === undefined || product.stock > 0;

  const actionHtml = hasVariants
    ? `<button class="add-to-cart" onclick="event.stopPropagation();window.location.href='product.html?id=${product.id}'">Choose Size</button>`
    : inStock
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
        ${stars ? `<div class="product-stars" aria-label="Rating">${stars}${reviewText}</div>` : ''}
        <div class="product-name">${product.name}</div>
        ${hasVariants ? `<div class="product-variant-count">${product.variant_count} sizes available</div>` : ''}
        <div class="product-desc">${product.description || ''}</div>
        ${benefitTags.length ? `<div class="product-tags">${benefitTags.map(tag => `<span>${tag}</span>`).join('')}</div>` : ''}
        <div class="product-footer">
          <div class="price-wrap">
            <span class="product-price">${hasVariants ? 'From ' : ''}₹${parseFloat(product.price).toFixed(0)}</span>
            ${comparePrice}
            ${discount}
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

  const products = groupProductVariants((await fetchProducts(100)).filter(product => !isRakhiStoreProduct(product))).slice(0, limit);

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

async function loadBestsellerProducts(containerId, limit = 6) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const products = (await fetchProducts(100)).filter(product => !isRakhiStoreProduct(product));
    const groupedProducts = groupProductVariants(products);
    const bestsellers = groupedProducts.filter(product =>
      BESTSELLER_KEYWORDS.some(name => String(product.name || '').toLowerCase().includes(name))
    );
    const visibleProducts = (bestsellers.length ? bestsellers : groupedProducts).slice(0, limit);

    if (visibleProducts.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--gray);">
          Products will appear here once the catalogue is available.
        </div>`;
      return;
    }

    container.innerHTML = visibleProducts.map(renderProductCard).join('');
    initCarouselHover();
    if (typeof window.onProductsLoaded === 'function') window.onProductsLoaded();
  } catch (err) {
    console.error('Error loading bestsellers:', err);
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--gray);">
        Could not load bestsellers. Please refresh the page.
      </div>`;
  }
}

window.loadBestsellerProducts = loadBestsellerProducts;
window.loadFeaturedProducts = loadFeaturedProducts;
window.isRakhiStoreProduct = isRakhiStoreProduct;
