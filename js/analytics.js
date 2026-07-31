// ===== CANECREME ANALYTICS =====
// Meta Pixel ID from CaneCreme Meta Events Manager.
const CANECREME_META_PIXEL_ID = '1039053602005956';
const CANECREME_GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

(function () {
  const isConfigured = value => value && !/^YOUR_|^G-XXXXXXXXXX$/.test(value);
  const hasMetaPixel = isConfigured(CANECREME_META_PIXEL_ID);
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

  function initMetaPixel() {
    if (!hasMetaPixel || window.fbq) return;

    !function(f,b,e,v,n,t,s) {
      if (f.fbq) return;
      n = f.fbq = function(){ n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('set', 'autoConfig', true, CANECREME_META_PIXEL_ID);
    window.fbq('init', CANECREME_META_PIXEL_ID);
    window.fbq('track', 'PageView', {}, { eventID: buildMetaEventId('PageView') });
  }

  function normalizeMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  function buildMetaEventId(eventName, seed) {
    const base = seed || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const safeBase = String(base).replace(/[^a-z0-9_-]/gi, '').slice(0, 72);
    return `cc-${String(eventName).toLowerCase()}-${safeBase || Date.now()}`;
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

  function buildMetaContents(items) {
    return items
      .filter(item => item.item_id)
      .map(item => ({
        id: item.item_id,
        quantity: item.quantity,
        item_price: item.price
      }));
  }

  function buildMetaContentIds(items) {
    return items.map(item => item.item_id).filter(Boolean);
  }

  function trackGoogleEvent(name, params) {
    if (hasGoogleAnalytics && typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  function trackMetaEvent(name, params, eventId) {
    if (hasMetaPixel && typeof window.fbq === 'function') {
      const options = eventId ? { eventID: eventId } : undefined;
      window.fbq('track', name, params || {}, options);
    }
  }

  function trackInitiateCheckout(data) {
    const items = normalizeItems(data && data.items);
    const value = normalizeMoney(data && data.value);
    const checkoutSeed = `${buildMetaContentIds(items).join('-')}-${value}-${Date.now()}`;

    trackMetaEvent('InitiateCheckout', {
      value,
      currency: 'INR',
      content_type: 'product',
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
      content_ids: buildMetaContentIds(items),
      contents: buildMetaContents(items)
    }, buildMetaEventId('InitiateCheckout', checkoutSeed));

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

    trackMetaEvent('Purchase', {
      value,
      currency: 'INR',
      content_type: 'product',
      content_ids: buildMetaContentIds(items),
      contents: buildMetaContents(items)
    }, buildMetaEventId('Purchase', orderId || Date.now()));

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

    trackMetaEvent('AddToCart', {
      value: price,
      currency: 'INR',
      content_name: itemName,
      content_type: 'product',
      content_ids: itemId ? [itemId] : [],
      contents: itemId ? [{ id: itemId, quantity: 1, item_price: price }] : []
    }, buildMetaEventId('AddToCart', `${itemId || itemName}-${Date.now()}`));

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
  initMetaPixel();
})();
