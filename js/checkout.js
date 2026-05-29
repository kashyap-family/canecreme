// ===== CHECKOUT with Razorpay =====

let currentOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
  renderOrderSummary();
});

function renderOrderSummary() {
  const summaryItems = document.getElementById('summary-items');
  const summaryTotal = document.getElementById('summary-total');

  if (!summaryItems) return;

  if (cart.length === 0) {
    summaryItems.innerHTML = '<p style="color:#6b6b6b;font-size:0.9rem;">Your cart is empty. <a href="shop.html">Go shopping &rarr;</a></p>';
    return;
  }

  summaryItems.innerHTML = cart.map(item => `
    <div class="summary-item">
      <span class="summary-item-name">${item.name}</span>
      <span class="summary-item-qty">x ${item.quantity}</span>
      <span>Rs. ${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');

  if (summaryTotal) summaryTotal.textContent = getCartTotal().toFixed(2);
}

async function createOrderInDB(customerData) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-order`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      customer: customerData,
      items: cart
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Order save error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.order;
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

document.getElementById('pay-btn').addEventListener('click', async () => {
  const btn = document.getElementById('pay-btn');
  const errorEl = document.getElementById('checkout-error');
  errorEl.style.display = 'none';

  const name = document.getElementById('c-name').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const address1 = document.getElementById('c-address1').value.trim();
  const city = document.getElementById('c-city').value.trim();
  const state = document.getElementById('c-state').value.trim();
  const pin = document.getElementById('c-pin').value.trim();
  const country = document.getElementById('c-country').value.trim();
  const address2 = document.getElementById('c-address2').value.trim();

  if (!name || !email || !phone || !address1 || !city || !state || !pin) {
    errorEl.textContent = 'Please fill in name, mobile, email, address, PIN, city and state.';
    errorEl.style.display = 'block';
    return;
  }

  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    errorEl.textContent = 'Please enter a valid Indian 6-digit PIN code.';
    errorEl.style.display = 'block';
    return;
  }

  if (cart.length === 0) {
    errorEl.textContent = 'Your cart is empty.';
    errorEl.style.display = 'block';
    return;
  }

  const total = getCartTotal();
  if (total < 1) {
    errorEl.textContent = 'Order total must be at least Rs. 1.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    const order = await createOrderInDB({ name, email, phone, address1, address2, city, state, pin, country });
    currentOrderId = order.id;
    await saveOrderItems(currentOrderId);
  } catch (dbErr) {
    console.error('Order save failed:', dbErr);
    errorEl.textContent = 'Could not save your order before payment. Please try again or contact support.';
    errorEl.style.display = 'block';
    btn.textContent = 'Pay Securely ->';
    btn.disabled = false;
    return;
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
        customer_email: email,
        customer_phone: phone,
        shipping_pin: pin,
        support_phone: typeof STORE_PHONE !== 'undefined' ? STORE_PHONE : '9891239312'
      },
      prefill: {
        name: name,
        email: email,
        contact: phone
      },
      theme: { color: '#BAD50D' },
      handler: async function(response) {
        if (currentOrderId) {
          try {
            await updatePaymentStatus(currentOrderId, response.razorpay_payment_id);
          } catch (confirmErr) {
            console.warn('Payment confirmation/Shiprocket failed:', confirmErr.message);
          }
        }
        localStorage.removeItem('canecreme_cart');
        window.location.href = `success.html?order=${encodeURIComponent(currentOrderId)}`;
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
