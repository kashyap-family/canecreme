type CheckoutItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type CheckoutBody = {
  customer: {
    name: string;
    email: string;
    phone: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    pin: string;
    country: string;
  };
  items: CheckoutItem[];
  payment_method?: "online" | "cod";
  delivery_charge?: number;
  coupon_code?: string;
  checkout_id?: string;
};

const normalizeItems = (items: CheckoutItem[]) =>
  items.map((item, index) => ({
    product_id: item.id || null,
    name: String(item.name || `CaneCreme Item ${index + 1}`),
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    subtotal: Number(item.price || 0) * Number(item.quantity || 0),
  }));

const isNearDelhiAddress = (customer: CheckoutBody["customer"]) => {
  const pin = String(customer.pin || "").trim();
  const city = String(customer.city || "").trim().toLowerCase();
  const state = String(customer.state || "").trim().toLowerCase();
  const ncrCities = ["delhi", "new delhi", "noida", "greater noida", "gurgaon", "gurugram", "ghaziabad", "faridabad"];

  if (state.includes("delhi") || ncrCities.some((name) => city.includes(name))) return true;
  return /^(110|121|122|201)/.test(pin);
};

const normalizeCouponCode = (value?: string) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const getCouponDiscount = (couponCode: string, subtotal: number) => {
  if (couponCode !== "WELCOME10" || subtotal <= 0) return 0;
  return Math.round((subtotal * 0.10) * 100) / 100;
};

const getPhoneVariants = (phone: string) => {
  const trimmed = String(phone || "").trim();
  const digits = trimmed.replace(/\D/g, "");
  const tenDigit = digits.length >= 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([
    trimmed,
    digits,
    tenDigit,
    tenDigit ? `91${tenDigit}` : "",
    tenDigit ? `+91${tenDigit}` : "",
  ].filter(Boolean)));
};

const hasUsedWelcomeCoupon = async (supabaseUrl: string, headers: HeadersInit, phone: string) => {
  const phoneFilters = getPhoneVariants(phone).map((value) => `customer_phone.eq.${value}`);
  if (phoneFilters.length === 0) return false;

  const params = new URLSearchParams({
    select: "id",
    coupon_code: "eq.WELCOME10",
    order_status: "not.eq.cancelled",
    limit: "1",
  });
  params.set("or", `(${phoneFilters.join(",")})`);

  const res = await fetch(`${supabaseUrl}/rest/v1/orders?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(`Coupon usage check failed: ${await res.text()}`);

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
};

const FREE_DELIVERY_MIN_SUBTOTAL = 499;

const getRecoveryOffer = async (supabaseUrl: string, headers: HeadersInit, couponCode: string, phone: string) => {
  if (!couponCode || couponCode === "WELCOME10") return null;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/abandoned_checkout_offers?select=*&coupon_code=eq.${encodeURIComponent(couponCode)}&limit=1`,
    { headers },
  );
  if (!res.ok) throw new Error(`Recovery coupon lookup failed: ${await res.text()}`);

  const rows = await res.json();
  const offer = Array.isArray(rows) ? rows[0] : null;
  if (!offer) throw new Error("This recovery coupon is not valid.");
  if (offer.used_at || offer.status === "recovered") throw new Error("This recovery coupon has already been used.");
  if (offer.status === "expired" || new Date(offer.expires_at).getTime() <= Date.now()) {
    throw new Error("This recovery coupon has expired.");
  }

  const customerPhone = String(offer.customer_phone || "").replace(/\D/g, "").slice(-10);
  const submittedPhone = String(phone || "").replace(/\D/g, "").slice(-10);
  if (customerPhone && submittedPhone && customerPhone !== submittedPhone) {
    throw new Error("This recovery coupon is linked to another customer.");
  }

  return offer;
};

const getRecoveryDiscount = (offer: Record<string, unknown> | null, subtotal: number, deliveryCharge: number) => {
  if (!offer || subtotal <= 0) return { discountAmount: 0, deliveryCharge };
  const offerType = String(offer.offer_type || "");
  const offerValue = Number(offer.offer_value || 0);

  if (offerType === "percent") {
    return {
      discountAmount: Math.round((subtotal * (offerValue / 100)) * 100) / 100,
      deliveryCharge,
    };
  }
  if (offerType === "amount") {
    return {
      discountAmount: Math.min(subtotal, offerValue),
      deliveryCharge,
    };
  }
  if (offerType === "free_shipping") {
    return {
      discountAmount: 0,
      deliveryCharge: 0,
    };
  }
  return { discountAmount: 0, deliveryCharge };
};

const getReusableCheckoutOrder = async (supabaseUrl: string, headers: HeadersInit, checkoutId?: string) => {
  if (!checkoutId) return null;

  const checkoutRes = await fetch(
    `${supabaseUrl}/rest/v1/abandoned_checkouts?select=order_id&id=eq.${encodeURIComponent(checkoutId)}&limit=1`,
    { headers },
  );
  if (!checkoutRes.ok) return null;

  const checkouts = await checkoutRes.json();
  const existingOrderId = Array.isArray(checkouts) ? checkouts[0]?.order_id : null;
  if (!existingOrderId) return null;

  const orderRes = await fetch(
    `${supabaseUrl}/rest/v1/orders?select=*&id=eq.${encodeURIComponent(existingOrderId)}&payment_status=eq.pending&order_status=not.eq.cancelled&limit=1`,
    { headers },
  );
  if (!orderRes.ok) return null;

  const orders = await orderRes.json();
  return Array.isArray(orders) ? orders[0] || null : null;
};

const getRecentReusablePendingOrder = async (
  supabaseUrl: string,
  headers: HeadersInit,
  customer: CheckoutBody["customer"],
  total: number,
) => {
  const phoneFilters = getPhoneVariants(customer.phone).map((value) => `customer_phone.eq.${value}`);
  if (phoneFilters.length === 0) return null;

  const params = new URLSearchParams({
    select: "*",
    payment_status: "eq.pending",
    order_status: "not.eq.cancelled",
    razorpay_order_id: "is.null",
    total_amount: `eq.${total.toFixed(2)}`,
    created_at: `gte.${new Date(Date.now() - 20 * 60 * 1000).toISOString()}`,
    order: "created_at.desc",
    limit: "1",
  });
  params.set("or", `(${phoneFilters.join(",")})`);

  const res = await fetch(`${supabaseUrl}/rest/v1/orders?${params.toString()}`, { headers });
  if (!res.ok) return null;

  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const linkCheckoutToOrder = async (
  supabaseUrl: string,
  headers: HeadersInit,
  checkoutId: string | undefined,
  orderId: string,
) => {
  if (!checkoutId) return;
  await fetch(`${supabaseUrl}/rest/v1/abandoned_checkouts?id=eq.${encodeURIComponent(checkoutId)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ order_id: orderId, last_step: "order_created", updated_at: new Date().toISOString() }),
  }).catch(() => null);
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as CheckoutBody;
    const customer = body.customer;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address1 || !customer?.city || !customer?.state || !customer?.pin) {
      return jsonResponse({ error: "Missing required customer details" }, 400);
    }
    if (!/^[1-9][0-9]{5}$/.test(customer.pin)) {
      return jsonResponse({ error: "Invalid Indian PIN code" }, 400);
    }
    if (items.length === 0) {
      return jsonResponse({ error: "Cart is empty" }, 400);
    }

    const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    if (!Number.isFinite(subtotal) || subtotal < 1) {
      return jsonResponse({ error: "Invalid order total" }, 400);
    }
    const paymentMethod = body.payment_method === "cod" ? "cod" : "online";
    const deliveryZone = isNearDelhiAddress(customer) ? "delhi_ncr" : "pan_india";
    let deliveryCharge = paymentMethod === "online" && subtotal >= FREE_DELIVERY_MIN_SUBTOTAL
      ? 0
      : deliveryZone === "delhi_ncr" ? 50 : 80;
    const couponCode = normalizeCouponCode(body.coupon_code);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    if (couponCode === "WELCOME10" && await hasUsedWelcomeCoupon(supabaseUrl, dbHeaders, customer.phone)) {
      return jsonResponse({ error: "WELCOME10 can be used only once per customer." }, 400);
    }

    const recoveryOffer = await getRecoveryOffer(supabaseUrl, dbHeaders, couponCode, customer.phone);
    const recoveryPricing = getRecoveryDiscount(recoveryOffer, subtotal, deliveryCharge);
    deliveryCharge = recoveryPricing.deliveryCharge;
    const discountAmount = recoveryOffer ? recoveryPricing.discountAmount : getCouponDiscount(couponCode, subtotal);
    const effectiveCouponCode = discountAmount > 0 || recoveryOffer ? couponCode : "";
    const total = Math.max(0, subtotal - discountAmount + deliveryCharge);
    const itemSnapshot = normalizeItems(items);

    const reusableOrder = await getReusableCheckoutOrder(supabaseUrl, dbHeaders, body.checkout_id);
    if (reusableOrder) {
      return jsonResponse({ order: reusableOrder, reused: true });
    }

    const recentReusableOrder = await getRecentReusablePendingOrder(supabaseUrl, dbHeaders, customer, total);
    if (recentReusableOrder) {
      await linkCheckoutToOrder(supabaseUrl, dbHeaders, body.checkout_id, recentReusableOrder.id);
      return jsonResponse({ order: recentReusableOrder, reused: true, reuse_reason: "recent_pending_match" });
    }

    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: {
          line1: customer.address1,
          line2: customer.address2 || "",
          city: customer.city,
          state: customer.state,
          pin: customer.pin,
          country: customer.country || "India",
          payment_method: paymentMethod,
          delivery_zone: deliveryZone,
          delivery_charge: deliveryCharge,
          subtotal_before_discount: subtotal,
          coupon_code: effectiveCouponCode || null,
          discount_amount: discountAmount,
          recovery_offer_id: recoveryOffer?.id || null,
          recovery_offer_label: recoveryOffer?.offer_label || null,
          items: itemSnapshot,
        },
        total_amount: total,
        discount_amount: discountAmount,
        coupon_code: effectiveCouponCode || null,
        payment_status: "pending",
        payment_method: paymentMethod,
        order_status: "new",
      }),
    });
    if (!orderRes.ok) throw new Error(`Order create failed: ${await orderRes.text()}`);

    const orders = await orderRes.json();
    const order = orders[0];

    await linkCheckoutToOrder(supabaseUrl, dbHeaders, body.checkout_id, order.id);

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      quantity: Number(item.quantity),
      price: Number(item.price),
    }));

    const itemsRes = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify(orderItems),
    });
    if (!itemsRes.ok) throw new Error(`Order items create failed: ${await itemsRes.text()}`);

    if (recoveryOffer?.abandoned_checkout_id) {
      await fetch(
        `${supabaseUrl}/rest/v1/abandoned_checkouts?id=eq.${encodeURIComponent(recoveryOffer.abandoned_checkout_id)}`,
        {
          method: "PATCH",
          headers: { ...dbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ order_id: order.id, last_step: "order_created", updated_at: new Date().toISOString() }),
        },
      ).catch(() => null);
    }

    return jsonResponse({ order });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
