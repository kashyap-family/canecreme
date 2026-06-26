// ===== CHECKOUT with Razorpay + COD =====

let currentOrderId = null;
let checkedMobile = '';
const CHECKOUT_PROFILE_KEY = 'canecreme_checkout_profile';
let phoneLookupTimer = null;
let lastPinLookup = '';

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
    if (field) field.addEventListener('input', renderOrderSummary);
  });

  renderOrderSummary();

  const mobileCheckBtn = document.getElementById('mobile-check-btn');
  if (mobileCheckBtn) mobileCheckBtn.addEventListener('click', checkMobileHistory);
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
  setFieldValue('c-email', email.includes('@canecreme.co') && email.startsWith('customer-') ? '' : email);
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
    return;
  }

  const subtotal = getCartTotal();
  const deliveryCharge = getDeliveryCharge();

  summaryItems.innerHTML = cart.map(item => `
    <div class="summary-item">
      <span class="summary-item-name">${item.name}</span>
      <span class="summary-item-qty">x ${item.quantity}</span>
      <span>Rs. ${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('') + `
    <div class="summary-item summary-delivery-row">
      <span class="summary-item-name">Delivery</span>
      <span class="summary-item-qty">${getDeliveryLabel()}</span>
      <span>${deliveryCharge > 0 ? `Rs. ${deliveryCharge.toFixed(2)}` : 'Free'}</span>
    </div>
  `;

  if (summaryTotal) summaryTotal.textContent = (subtotal + deliveryCharge).toFixed(2);
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
      delivery_charge: getDeliveryCharge()
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

function getDeliveryCharge() {
  if (getSelectedPaymentMethod() !== 'cod') return 0;
  return isNearDelhiAddress() ? 50 : 80;
}

function getDeliveryLabel() {
  if (getSelectedPaymentMethod() !== 'cod') return 'Prepaid';
  return isNearDelhiAddress() ? 'COD Delhi/NCR' : 'COD Pan India';
}

function getCheckoutButtonText() {
  if (!checkedMobile) return 'Check Mobile First';
  return getSelectedPaymentMethod() === 'cod' ? 'Place COD Order' : 'Pay Securely ->';
}

document.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'payment-method') {
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.textContent = getCheckoutButtonText();
    renderOrderSummary();
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
  const email = emailInput;
  const paymentMethod = getSelectedPaymentMethod();

  if (phone !== checkedMobile) {
    errorEl.textContent = 'Please check your mobile number before continuing.';
    errorEl.style.display = 'block';
    return;
  }

  if (!name || !phone || !emailInput || !address1 || !pin) {
    errorEl.textContent = 'Please fill in mobile, name, email, address and PIN.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
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

  const total = getCartTotal() + getDeliveryCharge();
  if (total < 1) {
    errorEl.textContent = 'Order total must be at least Rs. 1.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    const profile = { name, email: emailInput, phone, address1, address2, city, state, pin, country };
    saveCheckoutProfile(profile);
    renderSavedAddressCard(profile);
    const order = await createOrderInDB({ name, email, phone, address1, address2, city, state, pin, country });
    currentOrderId = order.id;
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
        }
        localStorage.removeItem('canecreme_cart');
        window.location.href = `order-placed.html?order=${encodeURIComponent(currentOrderId)}`;
      },
      modal: {
        ondismiss: function() {
          btn.textContent = 'Pay Securely ->';
          btn.disabled = false;
        }
      }
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function(response) {
      errorEl.textContent = 'Payment failed: ' + (response.error.description || 'Please try again.');
      errorEl.style.display = 'block';
      btn.textContent = 'Pay Securely ->';
      btn.disabled = false;
    });

    rzp.open();
  } catch (rzpErr) {
    console.error('Razorpay error:', rzpErr);
    errorEl.textContent = 'Payment gateway error: ' + rzpErr.message;
    errorEl.style.display = 'block';
    btn.textContent = 'Pay Securely ->';
    btn.disabled = false;
  }
});
