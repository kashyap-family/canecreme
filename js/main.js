// ===== MAIN.JS — UI interactions & animations =====

// ===== ENTRY POPUP =====
(function initPopup() {
  const overlay  = document.getElementById('popup-overlay');
  const closeBtn = document.getElementById('popup-close');
  const skipBtn  = document.getElementById('popup-skip');
  const acceptBtn = document.getElementById('popup-accept');
  const introStage = document.getElementById('popup-intro');
  const detailsStage = document.getElementById('popup-details');
  const form     = document.getElementById('popup-form');
  if (!overlay) return;

  async function copyPopupCoupon(button) {
    const code = button?.dataset?.code || 'WELCOME10';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const temp = document.createElement('input');
        temp.value = code;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
      }
      button.classList.add('is-copied');
      const label = button.querySelector('.popup-copy-label');
      if (label) label.textContent = 'Copied';
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        if (label) label.textContent = 'Copy';
      }, 1800);
    } catch (_) {
      const label = button.querySelector('.popup-copy-label');
      if (label) label.textContent = code;
    }
  }

  overlay.addEventListener('click', e => {
    const copyButton = e.target.closest('.popup-copy-code');
    if (copyButton) {
      e.preventDefault();
      e.stopPropagation();
      copyPopupCoupon(copyButton);
    }
  });

  // Don't show if already submitted
  if (localStorage.getItem('cc_popup_done')) return;

  // Show after 1.8 seconds
  setTimeout(() => overlay.classList.add('open'), 1800);

  function closePopup() {
    overlay.classList.remove('open');
  }

  function showDetailsForm() {
    if (introStage) introStage.hidden = true;
    if (detailsStage) detailsStage.hidden = false;
  }

  closeBtn?.addEventListener('click', closePopup);
  skipBtn?.addEventListener('click',  closePopup);
  acceptBtn?.addEventListener('click', showDetailsForm);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const phone = document.getElementById('popup-phone')?.value.trim();
    const email = document.getElementById('popup-email')?.value.trim();
    const errEl = document.getElementById('popup-error');

    if (!phone || !email) {
      errEl.textContent = 'Please enter your phone number and email.';
      errEl.style.display = 'block';
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      errEl.textContent = 'Please enter a valid 10-digit phone number.';
      errEl.style.display = 'block';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      errEl.style.display = 'block';
      return;
    }

    errEl.style.display = 'none';

    // Save lead to Supabase
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ name: '', phone: '+91' + phone, email, source: 'popup' })
      });
    } catch (_) { /* silent fail — still show success */ }

    // Show success state
    form.innerHTML = `
      <div class="popup-success">
        <p class="popup-eyebrow">Coupon saved</p>
        <h2 class="popup-heading">Your mystery treat is unlocked!</h2>
        <p class="popup-sub">Use this code at checkout for 10% off your first order.</p>
        <div class="popup-success-code">
          <span>WELCOME10</span>
          <button type="button" class="popup-copy-code" data-code="WELCOME10" aria-label="Copy coupon code WELCOME10">
            <span class="popup-copy-icon" aria-hidden="true"></span>
            <span class="popup-copy-label">Copy</span>
          </button>
        </div>
        <a class="popup-shop-now" href="shop.html">Shop now</a>
      </div>`;

    if (skipBtn) skipBtn.style.display = 'none';
    localStorage.setItem('cc_popup_done', '1');
  });
})();

// Sticky nav border on scroll
const nav = document.getElementById('nav');
if (nav) {
  const updateNavState = () => {
    nav.classList.toggle('scrolled', window.scrollY > 12);
  };
  updateNavState();
  window.addEventListener('scroll', updateNavState, { passive: true });
}

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');
if (hamburger && navLinks) {
  hamburger.setAttribute('aria-expanded', 'false');

  function closeMobileNav() {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger.addEventListener('click', () => {
    const isOpening = !navLinks.classList.contains('open');
    hamburger.classList.toggle('open', isOpening);
    navLinks.classList.toggle('open', isOpening);
    hamburger.setAttribute('aria-expanded', String(isOpening));
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (!link.closest('.nav-dropdown')) closeMobileNav();
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) {
      closeMobileNav();
    }
  });
}

// Subtle hero product parallax for premium depth on desktop.
const hero = document.querySelector('.hero');
const heroVisual = document.querySelector('.hero-visual');
const allowHeroMotion = window.matchMedia('(prefers-reduced-motion: no-preference)');
const isDesktopPointer = window.matchMedia('(min-width: 769px) and (pointer: fine)');
if (hero && heroVisual && allowHeroMotion.matches && isDesktopPointer.matches) {
  hero.addEventListener('mousemove', (event) => {
    const bounds = hero.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
    heroVisual.style.setProperty('--hero-parallax-x', `${x.toFixed(2)}px`);
    heroVisual.style.setProperty('--hero-parallax-y', `${y.toFixed(2)}px`);
  }, { passive: true });

  hero.addEventListener('mouseleave', () => {
    heroVisual.style.setProperty('--hero-parallax-x', '0px');
    heroVisual.style.setProperty('--hero-parallax-y', '0px');
  });
}

// Shop dropdown: hover works on desktop; tap opens it on touch/mobile.
document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
  const trigger = dropdown.querySelector(':scope > a');
  const menu = dropdown.querySelector('.dropdown-menu');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', (e) => {
    const isTouchLayout = window.matchMedia('(max-width: 768px)').matches;
    if (!isTouchLayout) return;
    e.preventDefault();
    dropdown.classList.toggle('open');
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      dropdown.classList.remove('open');
      if (hamburger && navLinks) {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
  });
});

// Scroll-fade entrance animations (Intersection Observer)
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // Stagger delay for grid children
      const delay = entry.target.dataset.delay || 0;
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, delay);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.fade-section, .fade-up').forEach(el => observer.observe(el));

// Stagger product cards when they load
function observeProductCards() {
  document.querySelectorAll('.product-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = `opacity 0.5s ease ${i * 0.08}s, transform 0.5s ease ${i * 0.08}s`;
    const cardObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          cardObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    cardObs.observe(card);
  });
}

// Re-observe after products load (called from products.js)
window.onProductsLoaded = observeProductCards;

// ===== SEARCH OVERLAY =====
(function initSearchOverlay() {
  const searchTriggers = document.querySelectorAll('.nav-search-link');
  if (!searchTriggers.length) return;

  let products = [];
  let hasLoaded = false;
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search CaneCreme products">
      <button class="search-close" type="button" aria-label="Close search">×</button>
      <label class="search-label" for="site-search-input">Search CaneCreme</label>
      <input id="site-search-input" class="search-input" type="search" placeholder="Search cookies, makhana, hampers..." autocomplete="off" />
      <div class="search-suggestions">
        <button type="button" data-search-suggestion="cookie">Cookies</button>
        <button type="button" data-search-suggestion="makhana">Makhana</button>
        <button type="button" data-search-suggestion="hamper">Gifting</button>
      </div>
      <div class="search-results" id="site-search-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('.search-input');
  const resultsEl = overlay.querySelector('.search-results');

  async function loadSearchProducts() {
    if (hasLoaded) return products;
    hasLoaded = true;
    if (typeof fetchProducts === 'function') {
      products = await fetchProducts(100);
      return products;
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/products?is_active=eq.true&limit=100&order=created_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      products = res.ok ? await res.json() : [];
    } catch (_) {
      products = [];
    }
    return products;
  }

  function productImage(product) {
    return Array.isArray(product.images) && product.images[0] ? product.images[0] : 'Assets/logo.png';
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = '<p class="search-empty">Try “cookie”, “makhana”, “bites”, or “hamper”.</p>';
      return;
    }

    const matches = products.filter(product => {
      const haystack = `${product.name || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 8);

    resultsEl.innerHTML = matches.length ? matches.map(product => `
      <a class="search-result" href="product.html?id=${encodeURIComponent(product.id)}">
        <img src="${productImage(product)}" alt="${product.name}" loading="lazy" />
        <span>
          <strong>${product.name}</strong>
          <small>₹${parseFloat(product.price || 0).toFixed(0)}</small>
        </span>
      </a>
    `).join('') : `<p class="search-empty">No products found for “${query.trim()}”. Try cookies, makhana, snacks, or gifting.</p>`;
  }

  async function openSearch(event) {
    event.preventDefault();
    overlay.classList.add('open');
    document.body.classList.add('search-open');
    resultsEl.innerHTML = '<p class="search-empty">Loading products...</p>';
    await loadSearchProducts();
    renderSearchResults(input.value);
    input.focus();
  }

  function closeSearch() {
    overlay.classList.remove('open');
    document.body.classList.remove('search-open');
  }

  searchTriggers.forEach(trigger => trigger.addEventListener('click', openSearch));
  overlay.querySelector('.search-close').addEventListener('click', closeSearch);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeSearch(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSearch(); });
  input.addEventListener('input', () => renderSearchResults(input.value));
  overlay.querySelectorAll('[data-search-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.searchSuggestion;
      renderSearchResults(input.value);
      input.focus();
    });
  });
})();

// ===== FLOATING WHATSAPP =====
(function initFloatingWhatsApp() {
  if (document.querySelector('.floating-whatsapp') || document.body.classList.contains('checkout-page')) return;
  const link = document.createElement('a');
  link.className = 'floating-whatsapp';
  link.href = 'https://wa.me/919891239312';
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', 'Chat with CaneCreme on WhatsApp');
  link.textContent = 'Chat with us';
  document.body.appendChild(link);
})();

// Fake live-order notifications are intentionally disabled.
(function initProofToast() {
  const toast = document.getElementById('proof-toast');
  if (!toast) return;
  toast.remove();
})();
