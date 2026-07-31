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

    window.fbq('init', CANECREME_META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      const itemId = String(item.id || item.product_id || item.sku || item.name || '').trim();
      const itemName = String(item.name || item.product_name || 'CaneCreme product').trim();
      const price = Number(item.price || item.unit_price || item.item_price || 0);
      const quantity = Number(item.quantity || 1);
      return {
        item_id: itemId || itemName,
        item_name: itemName,
        price: Number.isFinite(price) ? price : 0,
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

  function trackMetaEvent(name, params) {
    if (hasMetaPixel && typeof window.fbq === 'function') {
      window.fbq('track', name, params || {});
    }
  }

  function trackInitiateCheckout(data) {
    const items = normalizeItems(data && data.items);
    const value = Number(data && data.value || 0);

    trackMetaEvent('InitiateCheckout', {
      value,
      currency: 'INR',
      content_type: 'product',
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
      content_ids: buildMetaContentIds(items),
      contents: buildMetaContents(items)
    });

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
    const value = Number(data && data.value || 0);

    trackMetaEvent('Purchase', {
      value,
      currency: 'INR',
      content_type: 'product',
      content_ids: buildMetaContentIds(items),
      contents: buildMetaContents(items)
    });

    trackGoogleEvent('purchase', {
      transaction_id: orderId,
      currency: 'INR',
      value,
      items
    });
  }

  function trackAddToCart(product) {
    const price = Number(product && product.price || 0);
    const itemId = String(product && product.id || product && product.name || '');
    const itemName = String(product && product.name || 'CaneCreme product');

    trackMetaEvent('AddToCart', {
      value: price,
      currency: 'INR',
      content_name: itemName,
      content_type: 'product',
      content_ids: itemId ? [itemId] : [],
      contents: itemId ? [{ id: itemId, quantity: 1, item_price: price }] : []
    });

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
