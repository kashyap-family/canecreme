// ===== CHECKOUT with Razorpay + COD =====

let currentOrderId = null;
let checkedMobile = '';
const CHECKOUT_PROFILE_KEY = 'canecreme_checkout_profile';
const ABANDONED_CHECKOUT_SESSION_KEY = 'canecreme_checkout_session_id';
const ABANDONED_CHECKOUT_ID_KEY = 'canecreme_abandoned_checkout_id';
const CHECKOUT_COUPON_KEY = 'canecreme_checkout_coupon';
const WELCOME_COUPON_CODE = 'WELCOME10';
const WELCOME_COUPON_PERCENT = 10;
const FREE_DELIVERY_MIN_SUBTOTAL = 499;
let phoneLookupTimer = null;
let lastPinLookup = '';
let abandonedCheckoutTimer = null;
let appliedCouponCode = normalizeCouponCode(localStorage.getItem(CHECKOUT_COUPON_KEY) || '');

document.addEventListener('DOMContentLoaded', () => {
  hydrateSavedCheckoutProfile();

  const phoneInput = document.getElementById('c-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
      if (checkedMobile && phoneInput.value !== checkedMobile) {
        checkedMobile = '';
        setMobileMessage('');
        document.getElementById('customer-history').style.display = 'none';
        document.getElementById('saved-address-card').style.display = 'none';
        document.getElementById('delivery-details-panel').style.display = 'none';
        document.getElementById('payment-section').style.display = 'none';
        const payBtn = document.getElementById('pay-btn');
        payBtn.textContent = 'Check Mobile First';
      }
      clearTimeout(phoneLookupTimer);
      if (/^[6-9][0-9]{9}$/.test(phoneInput.value) && phoneInput.value !== checkedMobile) {
        phoneLookupTimer = setTimeout(checkMobileHistory, 350);
      }
    });
  }

  const pinInput = document.getElementById('c-pin');
  if (pinInput) {
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
      if (/^[1-9][0-9]{5}$/.test(pinInput.value) && pinInput.value !== lastPinLookup) {
        lookupPinDetails(pinInput.value);
      }
      renderOrderSummary();
    });
  }

  ['c-city', 'c-state'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', () => {
      renderOrderSummary();
      scheduleAbandonedCheckoutSave('delivery_details');
    });
  });

  ['c-name', 'c-email', 'c-phone', 'c-address1', 'c-address2', 'c-pin', 'c-country'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', () => scheduleAbandonedCheckoutSave('checkout_details'));
  });

  renderOrderSummary();

  const mobileCheckBtn = document.getElementById('mobile-check-btn');
  if (mobileCheckBtn) mobileCheckBtn.addEventListener('click', checkMobileHistory);

  const couponInput = document.getElementById('coupon-code');
  if (couponInput) {
    couponInput.value = appliedCouponCode;
    couponInput.addEventListener('input', () => {
      couponInput.value = normalizeCouponCode(couponInput.value);
      setCouponMessage('');
    });
    couponInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyCouponFromInput();
      }
    });
  }

  document.getElementById('apply-coupon-btn')?.addEventListener('click', applyCouponFromInput);
  document.getElementById('remove-coupon-btn')?.addEventListener('click', removeCoupon);
});

function setMobileMessage(message, isError = false) {
  const el = document.getElementById('mobile-check-message');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('err', isError);
}

function setPinMessage(message, isError = false) {
  const el = document.getElementById('pin-lookup-message');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('err', isError);
}

function renderCustomerHistory(history) {
  const panel = document.getElementById('customer-history');
  if (!panel) return;

  const orders = Array.isArray(history && history.orders) ? history.orders : [];
  if (orders.length === 0) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    return;
  }

  panel.innerHTML = `
    <h3>Saved details found</h3>
    <p class="mobile-check-message">We filled your delivery details from your latest order. Please check them before placing this order.</p>
  `;
  panel.style.display = 'block';
}

function getCheckoutProfile() {
  try {
    return JSON.parse(localStorage.getItem(CHECKOUT_PROFILE_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function getCurrentCustomerProfile() {
  return {
    name: document.getElementById('c-name')?.value.trim() || '',
    email: document.getElementById('c-email')?.value.trim() || '',
    phone: document.getElementById('c-phone')?.value.trim() || '',
    address1: document.getElementById('c-address1')?.value.trim() || '',
    address2: document.getElementById('c-address2')?.value.trim() || '',
    pin: document.getElementById('c-pin')?.value.trim() || '',
    city: document.getElementById('c-city')?.value.trim() || '',
    state: document.getElementById('c-state')?.value.trim() || '',
    country: document.getElementById('c-country')?.value.trim() || 'India'
  };
}

function getCheckoutSessionId() {
  let sessionId = localStorage.getItem(ABANDONED_CHECKOUT_SESSION_KEY);
  if (!sessionId) {
    const randomPart = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionId = `cc-${randomPart}`;
    localStorage.setItem(ABANDONED_CHECKOUT_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function getAbandonedCheckoutId() {
  return localStorage.getItem(ABANDONED_CHECKOUT_ID_KEY) || '';
}

function shouldSaveAbandonedCheckout(profile) {
  const phone = String(profile.phone || '').replace(/\D/g, '');
  const email = String(profile.email || '').trim();
  return cart.length > 0 && (/^[6-9][0-9]{9}$/.test(phone) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function scheduleAbandonedCheckoutSave(lastStep = 'checkout_details') {
  window.clearTimeout(abandonedCheckoutTimer);
  abandonedCheckoutTimer = window.setTimeout(() => {
    saveAbandonedCheckout(lastStep).catch(err => console.warn('Abandoned checkout save skipped:', err.message));
  }, 900);
}

async function saveAbandonedCheckout(lastStep = 'checkout_details', extra = {}) {
  const profile = getCurrentCustomerProfile();
  if (!shouldSaveAbandonedCheckout(profile)) return null;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/abandoned-checkouts`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'upsert',
      checkout_id: getAbandonedCheckoutId() || undefined,
      session_id: getCheckoutSessionId(),
      customer: profile,
      items: cart,
      payment_method: getSelectedPaymentMethod(),
      delivery_charge: getDeliveryCharge(),
      coupon_code: isValidCouponCode(appliedCouponCode) ? appliedCouponCode : undefined,
      discount_amount: getCheckoutPricing().discount,
      last_step: lastStep,
      page_url: window.location.href,
      order_id: extra.orderId
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Abandoned checkout error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (data.checkout?.id) localStorage.setItem(ABANDONED_CHECKOUT_ID_KEY, data.checkout.id);
  return data.checkout || null;
}

async function completeAbandonedCheckout(orderId) {
  const checkoutId = getAbandonedCheckoutId();
  const sessionId = localStorage.getItem(ABANDONED_CHECKOUT_SESSION_KEY);
  if (!checkoutId && !sessionId && !orderId) return;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/abandoned-checkouts`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'complete',
      checkout_id: checkoutId || undefined,
      session_id: sessionId || undefined,
      order_id: orderId
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Abandoned checkout completion error (${res.status}): ${errText}`);
  }

  localStorage.removeItem(ABANDONED_CHECKOUT_ID_KEY);
  localStorage.removeItem(ABANDONED_CHECKOUT_SESSION_KEY);
}

function saveCheckoutProfile(profile) {
  if (!profile || !/^[6-9][0-9]{9}$/.test(profile.phone || '')) return;
  localStorage.setItem(CHECKOUT_PROFILE_KEY, JSON.stringify({
    name: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    address1: profile.address1 || '',
    address2: profile.address2 || '',
    pin: profile.pin || '',
    city: profile.city || '',
    state: profile.state || '',
    country: profile.country || 'India',
    saved_at: new Date().toISOString()
  }));
}

function maskPhone(phone) {
  if (!phone || phone.length < 10) return phone || '';
  return `${phone.slice(0, 3)}${'*'.repeat(4)}${phone.slice(-3)}`;
}

function shortAddress(profile) {
  return [profile.address1, profile.city, profile.state, profile.pin]
    .filter(Boolean)
    .join(', ');
}

function renderSavedAddressCard(profile) {
  const panel = document.getElementById('saved-address-card');
  if (!panel || !profile || !profile.phone) return;

  panel.innerHTML = `
    <div class="saved-address-main">
      <div class="saved-address-pin" aria-hidden="true"></div>
      <div>
        <h3>Deliver To ${escapeHtml(profile.name || 'Saved Customer')}</h3>
        <p>${escapeHtml(shortAddress(profile) || 'Saved delivery address')}</p>
        <small>+91 ${escapeHtml(maskPhone(profile.phone))}${profile.email ? ` · ${escapeHtml(profile.email)}` : ''}</small>
      </div>
    </div>
    <button type="button" class="saved-address-change" id="change-address-btn">Change</button>
  `;
  panel.style.display = 'flex';

  const changeBtn = document.getElementById('change-address-btn');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      document.getElementById('delivery-details-panel').style.display = 'block';
      document.getElementById('delivery-details-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

async function lookupPinDetails(pin) {
  lastPinLookup = pin;
  setPinMessage('Finding city and state...');

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
    if (!res.ok) throw new Error('PIN lookup failed');
    const data = await res.json();
    const postOffice = Array.isArray(data)
      && data[0]
      && data[0].Status === 'Success'
      && Array.isArray(data[0].PostOffice)
      ? data[0].PostOffice[0]
      : null;

    if (!postOffice) throw new Error('PIN not found');

    setFieldValue('c-city', postOffice.District || postOffice.Block || '');
    setFieldValue('c-state', postOffice.State || '');
    setPinMessage(`${postOffice.District || 'City'} · ${postOffice.State || 'State'}`);
    renderOrderSummary();
  } catch (err) {
    const fallback = getFallbackLocationFromPin(pin);
    if (fallback) {
      setFieldValue('c-city', fallback.city);
      setFieldValue('c-state', fallback.state);
      setPinMessage(`${fallback.city} · ${fallback.state}`);
      renderOrderSummary();
      return;
    }
    setPinMessage('Could not auto-fill city. Tap email / city details if needed.', true);
  }
}

function getFallbackLocationFromPin(pin) {
  if (/^110/.test(pin)) return { city: 'New Delhi', state: 'Delhi' };
  if (/^(121|122)/.test(pin)) return { city: 'Gurugram', state: 'Haryana' };
  if (/^201/.test(pin)) return { city: 'Noida', state: 'Uttar Pradesh' };
  return null;
}

function hydrateSavedCheckoutProfile() {
  const profile = getCheckoutProfile();
  if (!profile || !/^[6-9][0-9]{9}$/.test(profile.phone || '')) return;

  setFieldValue('c-phone', profile.phone || '');
  setFieldValue('c-name', profile.name || '');
  setFieldValue('c-email', profile.email || '');
  setFieldValue('c-address1', profile.address1 || '');
  setFieldValue('c-address2', profile.address2 || '');
  setFieldValue('c-pin', profile.pin || '');
  setFieldValue('c-city', profile.city || '');
  setFieldValue('c-state', profile.state || '');
  setFieldValue('c-country', profile.country || 'India');

  checkedMobile = profile.phone;
  renderSavedAddressCard(profile);
  document.getElementById('payment-section').style.display = 'block';
  const payBtn = document.getElementById('pay-btn');
  if (payBtn) payBtn.textContent = getCheckoutButtonText();
  setMobileMessage('Saved delivery details found on this device.');
  renderOrderSummary();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isValidCouponCode(code) {
  return normalizeCouponCode(code) === WELCOME_COUPON_CODE;
}

function getCouponDiscount(subtotal) {
  if (!isValidCouponCode(appliedCouponCode) || subtotal <= 0) return 0;
  return Math.round((subtotal * WELCOME_COUPON_PERCENT / 100) * 100) / 100;
}

function getCheckoutPricing() {
  const subtotal = getCartTotal();
  const discount = getCouponDiscount(subtotal);
  const deliveryCharge = getDeliveryCharge();
  const total = Math.max(0, subtotal - discount + deliveryCharge);
  return { subtotal, discount, deliveryCharge, total };
}

function setCouponMessage(message, isError = false) {
  const messageEl = document.getElementById('coupon-message');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.classList.toggle('err', isError);
}

function syncCouponControls() {
  const input = document.getElementById('coupon-code');
  const applyBtn = document.getElementById('apply-coupon-btn');
  const removeBtn = document.getElementById('remove-coupon-btn');
  const hasValidCoupon = isValidCouponCode(appliedCouponCode);
  if (input && input.value !== appliedCouponCode) input.value = appliedCouponCode;
  if (applyBtn) applyBtn.textContent = hasValidCoupon ? 'Applied' : 'Apply';
  if (removeBtn) removeBtn.style.display = hasValidCoupon ? '' : 'none';
}

function syncCheckoutTotals(total) {
  const stickyTotal = document.getElementById('sticky-total');
  if (stickyTotal) stickyTotal.textContent = total.toFixed(2);

  const payBtn = document.getElementById('pay-btn');
  if (payBtn && !payBtn.disabled) payBtn.textContent = getCheckoutButtonText();
}

function applyCouponFromInput() {
  const input = document.getElementById('coupon-code');
  const code = normalizeCouponCode(input?.value || '');

  if (!code) {
    setCouponMessage('Enter coupon code WELCOME10.', true);
    return;
  }

  if (!isValidCouponCode(code)) {
    appliedCouponCode = '';
    localStorage.removeItem(CHECKOUT_COUPON_KEY);
    renderOrderSummary();
    setCouponMessage('This coupon code is not valid.', true);
    return;
  }

  appliedCouponCode = WELCOME_COUPON_CODE;
  localStorage.setItem(CHECKOUT_COUPON_KEY, appliedCouponCode);
  renderOrderSummary();
  const { discount } = getCheckoutPricing();
  setCouponMessage(`WELCOME10 applied. You saved Rs. ${discount.toFixed(2)}.`);
  scheduleAbandonedCheckoutSave('coupon_applied');
}

function removeCoupon() {
  appliedCouponCode = '';
  localStorage.removeItem(CHECKOUT_COUPON_KEY);
  const input = document.getElementById('coupon-code');
  if (input) input.value = '';
  renderOrderSummary();
  setCouponMessage('Coupon removed.');
  scheduleAbandonedCheckoutSave('coupon_removed');
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (!field || value === undefined || value === null) return;
  field.value = String(value);
}

function autofillSavedDetails(history) {
  const details = history && history.saved_details;
  if (!details) return false;

  setFieldValue('c-name', details.name || '');
  const email = details.email || '';
  const isInternalEmail = email.startsWith('customer-') && (email.includes('@canecreme.co') || email.includes('@canecreme.local'));
  setFieldValue('c-email', isInternalEmail ? '' : email);
  setFieldValue('c-address1', details.address1 || '');
  setFieldValue('c-address2', details.address2 || '');
  setFieldValue('c-pin', details.pin || '');
  setFieldValue('c-city', details.city || '');
  setFieldValue('c-state', details.state || '');
  setFieldValue('c-country', details.country || 'India');

  return Boolean(details.name || details.address1 || details.pin || details.city || details.state);
}

async function fetchCustomerHistory(phone) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-customer-history`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phone })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`History lookup error (${res.status}): ${errText}`);
  }

  return await res.json();
}

async function checkMobileHistory() {
  const phone = document.getElementById('c-phone').value.trim();
  const btn = document.getElementById('mobile-check-btn');
  const payBtn = document.getElementById('pay-btn');

  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    setMobileMessage('Enter a valid 10-digit mobile number.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Checking...';
  setMobileMessage('');

  try {
    const history = await fetchCustomerHistory(phone);
    checkedMobile = phone;
    document.getElementById('delivery-details-panel').style.display = 'block';
    document.getElementById('payment-section').style.display = 'block';
    const filledFromHistory = autofillSavedDetails(history);
    renderCustomerHistory(history);
    if (filledFromHistory) {
      const profile = getCurrentCustomerProfile();
      saveCheckoutProfile(profile);
      renderSavedAddressCard(profile);
      document.getElementById('delivery-details-panel').style.display = 'none';
    }
    renderOrderSummary();
    payBtn.textContent = getCheckoutButtonText();
    scheduleAbandonedCheckoutSave('mobile_checked');
    setMobileMessage(filledFromHistory
      ? 'Saved delivery details found.'
      : 'Add delivery address to continue.');
  } catch (err) {
    console.warn('Customer history lookup failed:', err);
    checkedMobile = phone;
    document.getElementById('customer-history').style.display = 'none';
    document.getElementById('delivery-details-panel').style.display = 'block';
    document.getElementById('payment-section').style.display = 'block';
    payBtn.textContent = getCheckoutButtonText();
    scheduleAbandonedCheckoutSave('mobile_checked');
    setMobileMessage('Add delivery address to continue.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
}

function renderOrderSummary() {
  const summaryItems = document.getElementById('summary-items');
  const summaryTotal = document.getElementById('summary-total');

  if (!summaryItems) return;

  if (cart.length === 0) {
    summaryItems.innerHTML = '<p style="color:#6b6b6b;font-size:0.9rem;">Your cart is empty. <a href="shop.html">Go shopping &rarr;</a></p>';
    if (summaryTotal) summaryTotal.textContent = '0.00';
    syncCheckoutTotals(0);
    return;
  }

  const { subtotal, discount, deliveryCharge, total } = getCheckoutPricing();

  summaryItems.innerHTML = cart.map(item => `
    <div class="summary-product">
      ${item.image ? `<img class="summary-product-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />` : '<div class="summary-product-image" aria-hidden="true"></div>'}
      <div class="summary-product-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span>Qty: ${item.quantity}</span>
      </div>
      <span class="summary-product-price">Rs. ${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('') + `
    <div class="summary-line">
      <span>Subtotal</span>
      <strong>Rs. ${subtotal.toFixed(2)}</strong>
    </div>
    <div class="summary-line summary-delivery-row">
      <span>Delivery</span>
      <strong>${deliveryCharge > 0 ? `Rs. ${deliveryCharge.toFixed(2)}` : 'FREE'}</strong>
    </div>
    ${discount > 0 ? `
      <div class="summary-line summary-discount-row">
        <span>Coupon (${WELCOME_COUPON_CODE})</span>
        <strong>- Rs. ${discount.toFixed(2)}</strong>
      </div>
    ` : ''}
  `;

  if (summaryTotal) summaryTotal.textContent = total.toFixed(2);
  syncCouponControls();
  syncCheckoutTotals(total);
}

async function createOrderInDB(customerData) {
  const paymentMethod = getSelectedPaymentMethod();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-order`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer: customerData,
      items: cart,
      payment_method: paymentMethod,
      delivery_charge: getDeliveryCharge(),
      coupon_code: isValidCouponCode(appliedCouponCode) ? appliedCouponCode : undefined
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Order save error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.order;
}

async function confirmCodOrder(orderId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-cod-order`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order_id: orderId })
  });

  if (!res.ok && res.status !== 207) {
    const errText = await res.text();
    throw new Error(`COD order error (${res.status}): ${errText}`);
  }
}

async function saveOrderItems(orderId) {
  // Order items are saved by the create-checkout-order Edge Function.
  return orderId;
}

async function updatePaymentStatus(orderId, paymentId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-paid-order`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      order_id: orderId,
      payment_id: paymentId
    })
  });

  if (!res.ok && res.status !== 207) {
    const errText = await res.text();
    throw new Error(`Payment update error (${res.status}): ${errText}`);
  }
}

function getSelectedPaymentMethod() {
  const selected = document.querySelector('input[name="payment-method"]:checked');
  return selected ? selected.value : 'online';
}

function isNearDelhiAddress() {
  const pin = (document.getElementById('c-pin')?.value || '').trim();
  const city = (document.getElementById('c-city')?.value || '').trim().toLowerCase();
  const state = (document.getElementById('c-state')?.value || '').trim().toLowerCase();
  const ncrCities = ['delhi', 'new delhi', 'noida', 'greater noida', 'gurgaon', 'gurugram', 'ghaziabad', 'faridabad'];

  if (state.includes('delhi') || ncrCities.some(name => city.includes(name))) return true;
  return /^(110|121|122|201)/.test(pin);
}

function getBaseDeliveryCharge() {
  return isNearDelhiAddress() ? 50 : 80;
}

function getDeliveryCharge() {
  const subtotal = getCartTotal();
  if (subtotal <= 0 || subtotal >= FREE_DELIVERY_MIN_SUBTOTAL) return 0;
  return getBaseDeliveryCharge();
}

function getDeliveryLabel() {
  if (getCartTotal() >= FREE_DELIVERY_MIN_SUBTOTAL) return 'Free over Rs. 499';
  return isNearDelhiAddress() ? 'Delhi/NCR delivery' : 'Pan India delivery';
}

function getCheckoutButtonText() {
  if (!checkedMobile) return 'Check Mobile First';
  const { total } = getCheckoutPricing();
  return getSelectedPaymentMethod() === 'cod'
    ? `Place Order Rs. ${total.toFixed(2)} ->`
    : `Pay Rs. ${total.toFixed(2)} ->`;
}

document.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'payment-method') {
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.textContent = getCheckoutButtonText();
    renderOrderSummary();
    scheduleAbandonedCheckoutSave('payment_method_selected');
  }
});

document.getElementById('pay-btn').addEventListener('click', async () => {
  const btn = document.getElementById('pay-btn');
  const errorEl = document.getElementById('checkout-error');
  errorEl.style.display = 'none';

  const name = document.getElementById('c-name').value.trim();
  const emailInput = document.getElementById('c-email').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address1 = document.getElementById('c-address1').value.trim();
  let city = document.getElementById('c-city').value.trim();
  let state = document.getElementById('c-state').value.trim();
  const pin = document.getElementById('c-pin').value.trim();
  const country = document.getElementById('c-country').value.trim();
  const address2 = document.getElementById('c-address2').value.trim();
  const email = emailInput || `customer-${phone}@canecreme.local`;
  const paymentMethod = getSelectedPaymentMethod();

  if (phone !== checkedMobile) {
    errorEl.textContent = 'Please check your mobile number before continuing.';
    errorEl.style.display = 'block';
    return;
  }

  if (!name || !phone || !address1 || !pin) {
    errorEl.textContent = 'Please fill in mobile, name, address and PIN.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
    errorEl.style.display = 'block';
    return;
  }

  if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    errorEl.textContent = 'Please enter a valid Indian 6-digit PIN code.';
    errorEl.style.display = 'block';
    return;
  }

  if (!city || !state) {
    const fallback = getFallbackLocationFromPin(pin);
    if (fallback) {
      city = fallback.city;
      state = fallback.state;
      setFieldValue('c-city', city);
      setFieldValue('c-state', state);
    }
  }

  if (!city || !state) {
    errorEl.textContent = 'Please tap "Email / city details" and add city and state for this PIN.';
    errorEl.style.display = 'block';
    return;
  }

  if (cart.length === 0) {
    errorEl.textContent = 'Your cart is empty.';
    errorEl.style.display = 'block';
    return;
  }

  const { total, discount } = getCheckoutPricing();
  if (total < 1) {
    errorEl.textContent = 'Order total must be at least Rs. 1.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    window.CaneCremeAnalytics?.trackInitiateCheckout({
      value: total,
      items: cart
    });
    const profile = { name, email: emailInput, phone, address1, address2, city, state, pin, country };
    saveCheckoutProfile(profile);
    renderSavedAddressCard(profile);
    await saveAbandonedCheckout('payment_attempted').catch(err => console.warn('Abandoned checkout pre-save failed:', err.message));
    const order = await createOrderInDB({ name, email, phone, address1, address2, city, state, pin, country });
    currentOrderId = order.id;
    await saveAbandonedCheckout('order_created', { orderId: currentOrderId }).catch(err => console.warn('Abandoned checkout order link failed:', err.message));
    await saveOrderItems(currentOrderId);
  } catch (dbErr) {
    console.error('Order save failed:', dbErr);
    errorEl.textContent = 'Could not save your order. Please try again or contact support.';
    errorEl.style.display = 'block';
    btn.textContent = getCheckoutButtonText();
    btn.disabled = false;
    return;
  }

  if (paymentMethod === 'cod') {
    try {
      await confirmCodOrder(currentOrderId);
      await completeAbandonedCheckout(currentOrderId).catch(err => console.warn('Abandoned checkout completion failed:', err.message));
      localStorage.removeItem('canecreme_cart');
      window.location.href = `order-placed.html?order=${encodeURIComponent(currentOrderId)}`;
      return;
    } catch (codErr) {
      console.error('COD order confirmation failed:', codErr);
      errorEl.textContent = 'Could not place your COD order. Please try again or contact support.';
      errorEl.style.display = 'block';
      btn.textContent = getCheckoutButtonText();
      btn.disabled = false;
      return;
    }
  }

  try {
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: Math.round(total * 100),
      currency: STORE_CURRENCY,
      name: STORE_NAME,
      description: 'Order #' + currentOrderId.slice(0, 8),
      notes: {
        order_id: currentOrderId,
        customer_name: name,
        customer_email: emailInput || '',
        customer_phone: phone,
        shipping_pin: pin,
        delivery_charge: String(getDeliveryCharge()),
        coupon_code: isValidCouponCode(appliedCouponCode) ? appliedCouponCode : '',
        discount_amount: String(discount),
        support_phone: typeof STORE_PHONE !== 'undefined' ? STORE_PHONE : '9891239312'
      },
      prefill: {
        name: name,
        email: emailInput || '',
        contact: phone
      },
      theme: { color: '#BAD50D' },
      handler: async function(response) {
        if (currentOrderId) {
          try {
            await updatePaymentStatus(currentOrderId, response.razorpay_payment_id);
          } catch (confirmErr) {
            console.warn('Payment confirmation failed:', confirmErr.message);
          }
          await completeAbandonedCheckout(currentOrderId).catch(err => console.warn('Abandoned checkout completion failed:', err.message));
        }
        localStorage.removeItem('canecreme_cart');
        window.location.href = `order-placed.html?order=${encodeURIComponent(currentOrderId)}`;
      },
      modal: {
        ondismiss: function() {
          btn.textContent = getCheckoutButtonText();
          btn.disabled = false;
        }
      }
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function(response) {
      errorEl.textContent = 'Payment failed: ' + (response.error.description || 'Please try again.');
      errorEl.style.display = 'block';
      btn.textContent = getCheckoutButtonText();
      btn.disabled = false;
    });

    rzp.open();
  } catch (rzpErr) {
    console.error('Razorpay error:', rzpErr);
    errorEl.textContent = 'Payment gateway error: ' + rzpErr.message;
    errorEl.style.display = 'block';
    btn.textContent = getCheckoutButtonText();
    btn.disabled = false;
  }
});
