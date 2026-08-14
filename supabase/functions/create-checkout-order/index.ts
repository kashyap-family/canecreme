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
    const deliveryCharge = paymentMethod === "online" && subtotal >= FREE_DELIVERY_MIN_SUBTOTAL
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

    const discountAmount = getCouponDiscount(couponCode, subtotal);
    const total = Math.max(0, subtotal - discountAmount + deliveryCharge);
    const itemSnapshot = normalizeItems(items);

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
          coupon_code: discountAmount > 0 ? couponCode : null,
          discount_amount: discountAmount,
          items: itemSnapshot,
        },
        total_amount: total,
        discount_amount: discountAmount,
        coupon_code: discountAmount > 0 ? couponCode : null,
        payment_status: "pending",
        order_status: "new",
      }),
    });
    if (!orderRes.ok) throw new Error(`Order create failed: ${await orderRes.text()}`);

    const orders = await orderRes.json();
    const order = orders[0];

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

    return jsonResponse({ order });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
