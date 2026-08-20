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
  const popupDoneKey = 'cc_popup_done';
  const checkoutCouponKey = 'canecreme_checkout_coupon';
  const firstTimeCoupon = 'WELCOME10';
  const sitePathPrefix = window.location.pathname.includes('/blog/') ? '../' : '';
  const pagePath = window.location.pathname.toLowerCase();
  const hasClaimedFirstCoupon = () => localStorage.getItem(popupDoneKey) === '1';
  const shouldShowNewHere = () =>
    !hasClaimedFirstCoupon() &&
    !pagePath.endsWith('/checkout.html') &&
    !pagePath.endsWith('/success.html') &&
    !pagePath.endsWith('/order-placed.html') &&
    !pagePath.endsWith('/admin.html') &&
    !document.body.classList.contains('checkout-page') &&
    !document.body.classList.contains('success-page') &&
    !document.body.classList.contains('order-placed-page') &&
    !document.body.classList.contains('admin-page');

  function hideNewHereButton() {
    document.querySelector('.new-here-coupon-trigger')?.remove();
  }

  function rememberCouponClaimed() {
    localStorage.setItem(popupDoneKey, '1');
    localStorage.setItem(checkoutCouponKey, firstTimeCoupon);
    hideNewHereButton();
  }

  function openPopup() {
    if (introStage) introStage.hidden = false;
    if (detailsStage) {
      detailsStage.hidden = true;
      detailsStage.classList.remove('is-unlocked');
    }
    overlay?.classList.add('open');
  }

  async function copyPopupCoupon(button) {
    const code = button?.dataset?.code || firstTimeCoupon;
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

  function createFallbackCouponModal() {
    if (document.getElementById('first-time-coupon-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'first-time-coupon-modal';
    modal.id = 'first-time-coupon-modal';
    modal.innerHTML = `
      <div class="first-time-coupon-card" role="dialog" aria-modal="true" aria-label="First order coupon">
        <button class="first-time-coupon-close" type="button" aria-label="Close">×</button>
        <p class="popup-eyebrow">New to CaneCreme?</p>
        <h2 class="popup-heading">Unlock 10% off your first order</h2>
        <p class="popup-sub">Enter your phone number and email to reveal your WELCOME10 coupon.</p>
        <form class="popup-form first-time-coupon-form" novalidate>
          <div class="popup-field"><div class="popup-phone-wrap"><span class="popup-phone-code">+91</span><input type="tel" name="phone" placeholder="WhatsApp number *" inputmode="numeric" maxlength="10" required /></div></div>
          <div class="popup-field"><input type="email" name="email" placeholder="Email address *" autocomplete="email" required /></div>
          <div class="popup-error" style="display:none;"></div>
          <button type="submit" class="popup-submit">Show my coupon</button>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.classList.remove('open');
    modal.querySelector('.first-time-coupon-close')?.addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelector('form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const phone = modal.querySelector('input[name="phone"]')?.value.trim();
      const email = modal.querySelector('input[name="email"]')?.value.trim();
      const errEl = modal.querySelector('.popup-error');
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
      try {
        if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
          await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ name: '', phone: '+91' + phone, email, source: 'new_here_button' })
          });
        }
      } catch (_) { /* silent fail - still show coupon */ }
      modal.querySelector('.first-time-coupon-card').innerHTML = `
        <button class="first-time-coupon-close" type="button" aria-label="Close">×</button>
        <div class="popup-success">
          <p class="popup-eyebrow">Coupon saved</p>
          <h2 class="popup-heading">Your first-order treat is unlocked!</h2>
          <p class="popup-sub">Use this code at checkout for 10% off your first order.</p>
          <div class="popup-success-code"><span>${firstTimeCoupon}</span><button type="button" class="popup-copy-code" data-code="${firstTimeCoupon}" aria-label="Copy coupon code ${firstTimeCoupon}"><span class="popup-copy-icon" aria-hidden="true"></span><span class="popup-copy-label">Copy</span></button></div>
        <a class="popup-shop-now" href="${sitePathPrefix}shop.html">Shop now</a>
      </div>`;
      modal.querySelector('.first-time-coupon-close')?.addEventListener('click', close);
      rememberCouponClaimed();
    });
  }

  function openFallbackCouponModal() {
    createFallbackCouponModal();
    document.getElementById('first-time-coupon-modal')?.classList.add('open');
  }

  function createNewHereButton() {
    if (!shouldShowNewHere() || document.querySelector('.new-here-coupon-trigger')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'new-here-coupon-trigger';
    button.setAttribute('aria-label', 'Open first order coupon');
    button.innerHTML = '<span class="new-here-coupon-icon" aria-hidden="true">□</span><span>New Here?</span>';
    button.addEventListener('click', () => {
      if (overlay) openPopup();
      else openFallbackCouponModal();
    });
    document.body.appendChild(button);
  }

  createNewHereButton();

  document.addEventListener('click', e => {
    const copyButton = e.target.closest('#first-time-coupon-modal .popup-copy-code');
    if (!copyButton) return;
    e.preventDefault();
    e.stopPropagation();
    copyPopupCoupon(copyButton);
  });

  if (!overlay) return;

  overlay.addEventListener('click', e => {
    const copyButton = e.target.closest('.popup-copy-code');
    if (copyButton) {
      e.preventDefault();
      e.stopPropagation();
      copyPopupCoupon(copyButton);
    }
  });

  // Don't auto-show if already submitted.
  if (hasClaimedFirstCoupon()) return;

  // Show after 1.8 seconds
  setTimeout(() => overlay.classList.add('open'), 1800);

  function closePopup() {
    overlay.classList.remove('open');
  }

  function showDetailsForm() {
    if (introStage) introStage.hidden = true;
    if (detailsStage) {
      detailsStage.hidden = false;
      detailsStage.classList.remove('is-unlocked');
    }
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
    detailsStage?.classList.add('is-unlocked');
    form.innerHTML = `
      <div class="popup-success">
        <p class="popup-eyebrow">Coupon saved</p>
        <h2 class="popup-heading">Your mystery treat is unlocked!</h2>
        <p class="popup-sub">Use this code at checkout for 10% off your first order.</p>
        <div class="popup-success-code">
          <span>${firstTimeCoupon}</span>
          <button type="button" class="popup-copy-code" data-code="${firstTimeCoupon}" aria-label="Copy coupon code ${firstTimeCoupon}">
            <span class="popup-copy-icon" aria-hidden="true"></span>
            <span class="popup-copy-label">Copy</span>
          </button>
        </div>
        <a class="popup-shop-now" href="shop.html">Shop now</a>
      </div>`;

    if (skipBtn) skipBtn.style.display = 'none';
    rememberCouponClaimed();
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
