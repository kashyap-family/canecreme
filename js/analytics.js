// ===== CANECREME ANALYTICS =====
const CANECREME_GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

(function () {
  const isConfigured = value => value && !/^YOUR_|^G-XXXXXXXXXX$/.test(value);
  const hasGoogleAnalytics = isConfigured(CANECREME_GA_MEASUREMENT_ID);

  function initGoogleAnalytics() {
    if (!hasGoogleAnalytics || window.gtag) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CANECREME_GA_MEASUREMENT_ID)}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CANECREME_GA_MEASUREMENT_ID);
  }

  function normalizeMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      const itemId = String(item.id || item.product_id || item.sku || item.name || '').trim();
      const itemName = String(item.name || item.product_name || 'CaneCreme product').trim();
      const price = normalizeMoney(item.price || item.unit_price || item.item_price);
      const quantity = Number(item.quantity || 1);
      return {
        item_id: itemId || itemName,
        item_name: itemName,
        price,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
      };
    });
  }

  function trackGoogleEvent(name, params) {
    if (hasGoogleAnalytics && typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  function trackInitiateCheckout(data) {
    const items = normalizeItems(data && data.items);
    const value = normalizeMoney(data && data.value);

    trackGoogleEvent('begin_checkout', {
      currency: 'INR',
      value,
      items
    });
  }

  function trackPurchase(data) {
    const orderId = String(data && data.order_id || '');
    if (orderId) {
      const key = `canecreme_purchase_tracked_${orderId}`;
      if (sessionStorage.getItem(key) === 'true') return;
      sessionStorage.setItem(key, 'true');
    }

    const items = normalizeItems(data && data.items);
    const value = normalizeMoney(data && data.value);

    trackGoogleEvent('purchase', {
      transaction_id: orderId,
      currency: 'INR',
      value,
      items
    });
  }

  function trackAddToCart(product) {
    const price = normalizeMoney(product && product.price);
    const itemId = String(product && product.id || product && product.name || '');
    const itemName = String(product && product.name || 'CaneCreme product');

    trackGoogleEvent('add_to_cart', {
      currency: 'INR',
      value: price,
      items: [{ item_id: itemId, item_name: itemName, price, quantity: 1 }]
    });
  }

  window.CaneCremeAnalytics = {
    trackInitiateCheckout,
    trackPurchase,
    trackAddToCart
  };

  initGoogleAnalytics();
})();
