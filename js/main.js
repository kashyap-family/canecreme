// ===== MAIN.JS — UI interactions & animations =====

// ===== ENTRY POPUP =====
(function initPopup() {
  const overlay  = document.getElementById('popup-overlay');
  const closeBtn = document.getElementById('popup-close');
  const skipBtn  = document.getElementById('popup-skip');
  const form     = document.getElementById('popup-form');
  if (!overlay) return;

  // Don't show if already submitted
  if (localStorage.getItem('cc_popup_done')) return;

  // Show after 1.8 seconds
  setTimeout(() => overlay.classList.add('open'), 1800);

  function closePopup() {
    overlay.classList.remove('open');
  }

  closeBtn?.addEventListener('click', closePopup);
  skipBtn?.addEventListener('click',  closePopup);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const name  = document.getElementById('popup-name')?.value.trim();
    const phone = document.getElementById('popup-phone')?.value.trim();
    const email = document.getElementById('popup-email')?.value.trim();
    const errEl = document.getElementById('popup-error');

    if (!name || !phone || !email) {
      errEl.textContent = 'Please fill in all fields.';
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
        body: JSON.stringify({ name, phone: '+91' + phone, email, source: 'popup' })
      });
    } catch (_) { /* silent fail — still show success */ }

    // Show success state
    form.innerHTML = `
      <div style="text-align:center;padding:1.5rem 0;">
        <div style="font-size:3rem;margin-bottom:1rem;">🎉</div>
        <p style="font-family:var(--font-display);font-size:1.5rem;color:var(--dark);margin-bottom:0.5rem;">You're in!</p>
        <p style="font-size:0.88rem;color:var(--gray);line-height:1.6;margin-bottom:1.25rem;">Use code <strong style="color:var(--green);letter-spacing:0.05em;">WELCOME10</strong> at checkout for 10% off your first order.</p>
        <button onclick="document.getElementById('popup-overlay').classList.remove('open')" style="background:var(--green);color:white;border:none;padding:0.75rem 2rem;border-radius:6px;font-size:0.88rem;cursor:pointer;font-family:var(--font-body);">Start Shopping →</button>
      </div>`;

    if (skipBtn) skipBtn.style.display = 'none';
    localStorage.setItem('cc_popup_done', '1');
  });
})();

// Sticky nav border on scroll
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    }
  });
}

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

// ===== SOCIAL PROOF TOAST =====
(function initProofToast() {
  const toast = document.getElementById('proof-toast');
  if (!toast) return;

  const data = [
    { name: 'Priya from Delhi',     product: 'just ordered Raw Cane Sugar Gelato!', icon: '🍦' },
    { name: 'Rahul from Mumbai',    product: 'just ordered Raw Cane Sugar Syrup!',  icon: '🍯' },
    { name: 'Anjali from Bengaluru',product: 'just ordered Jam Spread!',       icon: '🫙' },
    { name: 'Vikram from Pune',     product: 'just ordered Raw Cane Sugar Gelato!', icon: '🍦' },
    { name: 'Sneha from Hyderabad', product: 'just ordered Raw Cane Sugar Syrup!',  icon: '🍯' },
  ];

  function showToast() {
    const item = data[Math.floor(Math.random() * data.length)];
    document.getElementById('proof-name').textContent    = item.name;
    document.getElementById('proof-product').textContent = item.product;
    document.getElementById('proof-icon').textContent    = item.icon;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4500);
  }

  // First show after 9s, then every 22s
  setTimeout(() => { showToast(); setInterval(showToast, 22000); }, 9000);
})();
