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
    summaryItems.innerHTML = '<p style="color:#6b6b6b;font-size:0.9rem;">Your cart is empty. <a href="shop.html">Go shopping →</a></p>';
    return;
  }

  summaryItems.innerHTML = cart.map(item => `
    <div class="summary-item">
      <span class="summary-item-name">${item.name}</span>
      <span class="summary-item-qty">× ${item.quantity}</span>
      <span>₹${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');

  if (summaryTotal) summaryTotal.textContent = getCartTotal().toFixed(2);
}

async function createOrderInDB(customerData) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      customer_name:    customerData.name,
      customer_email:   customerData.email,
      customer_phone:   customerData.phone,
      shipping_address: {
        line1:   customerData.address1,
        line2:   customerData.address2,
        city:    customerData.city,
        state:   customerData.state,
        pin:     customerData.pin,
        country: customerData.country
      },
      total_amount:   getCartTotal(),
      payment_status: 'pending',
      order_status:   'new'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase order error (${res.status}): ${errText}`);
  }
  const orders = await res.json();
  return orders[0];
}

async function saveOrderItems(orderId) {
  const items = cart.map(item => ({
    order_id:   orderId,
    product_id: item.id,
    quantity:   item.quantity,
    price:      item.price
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(items)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn('order_items save failed:', errText);
    // Non-fatal — don't block payment
  }
}

async function updatePaymentStatus(orderId, paymentId) {
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payment_id:     paymentId,
      payment_status: 'paid',
      order_status:   'processing'
    })
  });
}

document.getElementById('pay-btn').addEventListener('click', async () => {
  const btn     = document.getElementById('pay-btn');
  const errorEl = document.getElementById('checkout-error');
  errorEl.style.display = 'none';

  // Validate form
  const name     = document.getElementById('c-name').value.trim();
  const email    = document.getElementById('c-email').value.trim();
  const phone    = document.getElementById('c-phone').value.trim();
  const address1 = document.getElementById('c-address1').value.trim();
  const city     = document.getElementById('c-city').value.trim();
  const state    = document.getElementById('c-state').value.trim();
  const pin      = document.getElementById('c-pin').value.trim();
  const country  = document.getElementById('c-country').value.trim();
  const address2 = document.getElementById('c-address2').value.trim();

  if (!name || !email || !phone || !address1 || !city || !state || !pin) {
    errorEl.textContent = 'Please fill in all required fields.';
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
    errorEl.textContent = 'Order total must be at least ₹1.';
    errorEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Processing...';
  btn.disabled = true;

  // Step 1: Try to save order to Supabase (non-blocking on failure)
  try {
    const order = await createOrderInDB({ name, email, phone, address1, address2, city, state, pin, country });
    currentOrderId = order.id;
    await saveOrderItems(currentOrderId);
  } catch (dbErr) {
    console.warn('DB save skipped:', dbErr.message);
    // Continue to payment even if DB fails
  }

  // Step 2: Open Razorpay
  try {
    const options = {
      key:         RAZORPAY_KEY_ID,
      amount:      Math.round(total * 100), // paise
      currency:    STORE_CURRENCY,
      name:        STORE_NAME,
      description: currentOrderId ? 'Order #' + currentOrderId.slice(0, 8) : 'CaneCreme Order',
      notes: {
        order_id:       currentOrderId || 'not_saved',
        customer_name:  name,
        customer_email: email,
        customer_phone: phone,
        shipping_pin:   pin,
        support_phone:  typeof STORE_PHONE !== 'undefined' ? STORE_PHONE : '9891239312'
      },
      prefill: {
        name:    name,
        email:   email,
        contact: phone
      },
      theme: { color: '#BAD50D' },
      handler: async function(response) {
        if (currentOrderId) {
          await updatePaymentStatus(currentOrderId, response.razorpay_payment_id);
        }
        localStorage.removeItem('canecreme_cart');
        window.location.href = currentOrderId ? `success.html?order=${encodeURIComponent(currentOrderId)}` : 'success.html';
      },
      modal: {
        ondismiss: function() {
          btn.textContent = 'Pay Securely →';
          btn.disabled = false;
        }
      }
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function(response) {
      errorEl.textContent = 'Payment failed: ' + (response.error.description || 'Please try again.');
      errorEl.style.display = 'block';
      btn.textContent = 'Pay Securely →';
      btn.disabled = false;
    });

    rzp.open();

  } catch (rzpErr) {
    console.error('Razorpay error:', rzpErr);
    errorEl.textContent = 'Payment gateway error: ' + rzpErr.message;
    errorEl.style.display = 'block';
    btn.textContent = 'Pay Securely →';
    btn.disabled = false;
  }
});
