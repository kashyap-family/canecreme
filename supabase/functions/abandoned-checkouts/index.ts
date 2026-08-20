import { isAdminRequest, type AdminAuthBody } from "../_shared/admin-auth.ts";

type CheckoutItem = {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
  image?: string;
};

type RecoveryOffer = {
  key: "percent_5" | "percent_10" | "amount_50" | "free_shipping" | "no_offer";
  label: string;
  type: "percent" | "amount" | "free_shipping" | "none";
  value: number;
};

type AbandonedCheckoutBody = {
  admin_password?: string;
  admin_session?: string;
  action?: "upsert" | "complete" | "close" | "list" | "create_offer" | "mark_whatsapp_opened" | "mark_contacted" | "recover";
  checkout_id?: string;
  session_id?: string;
  order_id?: string;
  offer_key?: RecoveryOffer["key"];
  coupon_code?: string;
  last_step?: string;
  page_url?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    pin?: string;
    country?: string;
  };
  items?: CheckoutItem[];
  payment_method?: "online" | "cod";
  delivery_charge?: number;
  discount_amount?: number;
} & AdminAuthBody;

const RECOVERY_OFFERS: Record<RecoveryOffer["key"], RecoveryOffer> = {
  percent_5: { key: "percent_5", label: "5% OFF", type: "percent", value: 5 },
  percent_10: { key: "percent_10", label: "10% OFF", type: "percent", value: 10 },
  amount_50: { key: "amount_50", label: "Rs. 50 OFF", type: "amount", value: 50 },
  free_shipping: { key: "free_shipping", label: "FREE SHIPPING", type: "free_shipping", value: 0 },
  no_offer: { key: "no_offer", label: "No Offer", type: "none", value: 0 },
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

const cleanPhone = (phone?: string) => String(phone || "").replace(/\D/g, "").slice(-10);
const normalizeCouponCode = (value?: string) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeItems = (items: CheckoutItem[] = []) =>
  items.map((item, index) => {
    const price = Number(item.price || 0);
    const quantity = Number(item.quantity || 0);
    return {
      product_id: item.id || null,
      id: item.id || null,
      name: String(item.name || `CaneCreme Item ${index + 1}`),
      image: item.image || null,
      quantity,
      price,
      subtotal: price * quantity,
    };
  }).filter((item) => item.quantity > 0 && item.price > 0);

const getCouponDiscount = (couponCode: string, subtotal: number, requestedDiscount?: number) => {
  if (couponCode !== "WELCOME10" || subtotal <= 0) return 0;
  const calculated = Math.round((subtotal * 0.10) * 100) / 100;
  const requested = Number(requestedDiscount || 0);
  return requested > 0 ? Math.min(calculated, requested) : calculated;
};

const dbFetch = async (supabaseUrl: string, headers: HeadersInit, path: string, init: RequestInit = {}) => {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res;
};

const buildCheckoutLink = (checkoutId: string) => `https://www.canecreme.co/checkout.html?recover=${encodeURIComponent(checkoutId)}`;

const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  bytes.forEach((byte) => suffix += chars[byte % chars.length]);
  return `CC${suffix}`;
};

const createUniqueCouponCode = async (supabaseUrl: string, headers: HeadersInit) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const lookup = await dbFetch(
      supabaseUrl,
      headers,
      `abandoned_checkout_offers?select=id&coupon_code=eq.${encodeURIComponent(code)}&limit=1`,
    );
    const rows = await lookup.json();
    if (!Array.isArray(rows) || rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique coupon code");
};

const updateExpiredOffers = async (supabaseUrl: string, headers: HeadersInit) => {
  await dbFetch(supabaseUrl, headers, `abandoned_checkout_offers?status=in.(offer_created,whatsapp_opened,contacted)&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
  }).catch(() => null);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as AbandonedCheckoutBody;
    const action = body.action || "upsert";
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    if (action === "list") {
      if (!await isAdminRequest(body)) return jsonResponse({ error: "Unauthorized" }, 401);
      await updateExpiredOffers(supabaseUrl, headers);

      const res = await dbFetch(
        supabaseUrl,
        headers,
        "abandoned_checkouts?select=*&status=eq.active&order_id=is.null&order=updated_at.desc&limit=200",
      );
      const rows = await res.json();
      const checkouts = Array.isArray(rows)
        ? rows.filter((checkout: Record<string, unknown>) =>
          !checkout.order_id &&
          checkout.status === "active" &&
          checkout.recovery_status !== "recovered" &&
          checkout.last_step !== "order_created"
        )
        : [];
      const ids = Array.isArray(checkouts) ? checkouts.map((checkout) => checkout.id).filter(Boolean) : [];
      let offers: Record<string, unknown> = {};

      if (ids.length > 0) {
        const offerRes = await dbFetch(
          supabaseUrl,
          headers,
          `abandoned_checkout_offers?select=*&abandoned_checkout_id=in.(${ids.join(",")})&order=created_at.desc`,
        );
        const rows = await offerRes.json();
        rows.forEach((offer: Record<string, unknown>) => {
          const checkoutId = String(offer.abandoned_checkout_id || "");
          if (checkoutId && !offers[checkoutId]) offers[checkoutId] = offer;
        });
      }

      const merged = checkouts.map((checkout: Record<string, unknown>) => ({
        ...checkout,
        checkout_link: buildCheckoutLink(String(checkout.id)),
        recovery_offer: offers[String(checkout.id)] || null,
      }));
      return jsonResponse({ checkouts: merged });
    }

    if (action === "recover") {
      if (!body.checkout_id) return jsonResponse({ error: "checkout_id is required" }, 400);

      const res = await dbFetch(
        supabaseUrl,
        headers,
        `abandoned_checkouts?select=id,cart_items,cart_total,payment_method,status,recovery_status&status=eq.active&id=eq.${encodeURIComponent(body.checkout_id)}&limit=1`,
      );
      const rows = await res.json();
      const checkout = Array.isArray(rows) ? rows[0] : null;
      if (!checkout) return jsonResponse({ error: "Recovery link is no longer active" }, 404);

      const offerRes = await dbFetch(
        supabaseUrl,
        headers,
        `abandoned_checkout_offers?select=coupon_code,offer_label,offer_type,offer_value,expires_at,status,used_at&abandoned_checkout_id=eq.${encodeURIComponent(body.checkout_id)}&status=not.eq.expired&order=created_at.desc&limit=1`,
      );
      const offers = await offerRes.json();
      const offer = Array.isArray(offers) ? offers[0] : null;
      if (offer && (offer.used_at || new Date(offer.expires_at).getTime() <= Date.now())) {
        return jsonResponse({ checkout, offer: null });
      }

      return jsonResponse({ checkout, offer });
    }

    if (action === "create_offer") {
      if (!await isAdminRequest(body)) return jsonResponse({ error: "Unauthorized" }, 401);
      if (!body.checkout_id) return jsonResponse({ error: "checkout_id is required" }, 400);
      const offer = RECOVERY_OFFERS[body.offer_key || "percent_10"];
      if (!offer) return jsonResponse({ error: "Invalid offer" }, 400);

      const checkoutRes = await dbFetch(
        supabaseUrl,
        headers,
        `abandoned_checkouts?select=*&id=eq.${encodeURIComponent(body.checkout_id)}&limit=1`,
      );
      const checkoutRows = await checkoutRes.json();
      const checkout = Array.isArray(checkoutRows) ? checkoutRows[0] : null;
      if (!checkout) return jsonResponse({ error: "Abandoned checkout not found" }, 404);
      if (checkout.status !== "active") return jsonResponse({ error: "This checkout is no longer active" }, 400);

      const existingRes = await dbFetch(
        supabaseUrl,
        headers,
        `abandoned_checkout_offers?select=*&abandoned_checkout_id=eq.${encodeURIComponent(body.checkout_id)}&offer_key=eq.${offer.key}&limit=1`,
      );
      const existingRows = await existingRes.json();
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (existing) {
        return jsonResponse({ offer: existing, checkout_link: existing.checkout_link || buildCheckoutLink(body.checkout_id), reused: true });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const couponCode = offer.type === "none" ? "" : await createUniqueCouponCode(supabaseUrl, headers);
      const checkoutLink = buildCheckoutLink(body.checkout_id);
      const offerPayload = {
        abandoned_checkout_id: body.checkout_id,
        customer_phone: checkout.customer_phone || null,
        customer_email: checkout.customer_email || null,
        offer_key: offer.key,
        offer_label: offer.label,
        offer_type: offer.type,
        offer_value: offer.value,
        coupon_code: couponCode || `NOOFFER-${String(body.checkout_id).slice(0, 8).toUpperCase()}`,
        checkout_link: checkoutLink,
        expires_at: expiresAt,
        status: "offer_created",
        updated_at: new Date().toISOString(),
      };

      const insertRes = await dbFetch(supabaseUrl, headers, "abandoned_checkout_offers", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(offerPayload),
      });
      const inserted = await insertRes.json();
      const created = Array.isArray(inserted) ? inserted[0] : null;

      await dbFetch(supabaseUrl, headers, `abandoned_checkouts?id=eq.${encodeURIComponent(body.checkout_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          recovery_status: "offer_created",
          recovery_offer_id: created?.id || null,
          updated_at: new Date().toISOString(),
        }),
      });

      return jsonResponse({ offer: created, checkout_link: checkoutLink, reused: false });
    }

    if (action === "mark_whatsapp_opened" || action === "mark_contacted") {
      if (!await isAdminRequest(body)) return jsonResponse({ error: "Unauthorized" }, 401);
      if (!body.checkout_id) return jsonResponse({ error: "checkout_id is required" }, 400);
      const nextStatus = action === "mark_contacted" ? "contacted" : "whatsapp_opened";

      await dbFetch(supabaseUrl, headers, `abandoned_checkout_offers?abandoned_checkout_id=eq.${encodeURIComponent(body.checkout_id)}&status=not.in.(recovered,expired)`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: nextStatus, updated_at: new Date().toISOString() }),
      });
      await dbFetch(supabaseUrl, headers, `abandoned_checkouts?id=eq.${encodeURIComponent(body.checkout_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ recovery_status: nextStatus, updated_at: new Date().toISOString() }),
      });
      return jsonResponse({ ok: true, recovery_status: nextStatus });
    }

    if (action === "close") {
      if (!await isAdminRequest(body)) return jsonResponse({ error: "Unauthorized" }, 401);
      if (!body.checkout_id) return jsonResponse({ error: "checkout_id is required" }, 400);

      await dbFetch(supabaseUrl, headers, `abandoned_checkouts?id=eq.${encodeURIComponent(body.checkout_id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "completed",
          recovery_status: "contacted",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      return jsonResponse({ ok: true });
    }

    if (action === "complete") {
      if (!body.checkout_id && !body.session_id && !body.order_id) {
        return jsonResponse({ error: "checkout_id, session_id, or order_id is required" }, 400);
      }

      const patch = {
        status: "completed",
        recovery_status: "recovered",
        order_id: body.order_id || null,
        completed_at: new Date().toISOString(),
        recovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const filter = body.checkout_id
        ? `id=eq.${encodeURIComponent(body.checkout_id)}`
        : body.order_id
          ? `order_id=eq.${encodeURIComponent(body.order_id)}`
          : `session_id=eq.${encodeURIComponent(body.session_id || "")}&status=eq.active`;

      await dbFetch(supabaseUrl, headers, `abandoned_checkouts?${filter}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });

      if (body.checkout_id || body.coupon_code) {
        const offerFilter = body.coupon_code
          ? `coupon_code=eq.${encodeURIComponent(normalizeCouponCode(body.coupon_code))}`
          : `abandoned_checkout_id=eq.${encodeURIComponent(body.checkout_id || "")}`;
        await dbFetch(supabaseUrl, headers, `abandoned_checkout_offers?${offerFilter}&used_at=is.null`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "recovered",
            used_at: new Date().toISOString(),
            used_order_id: body.order_id || null,
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => null);
      }

      return jsonResponse({ ok: true });
    }

    const customer = body.customer || {};
    const items = normalizeItems(body.items || []);
    const phone = cleanPhone(customer.phone);
    const email = String(customer.email || "").trim().toLowerCase();
    const sessionId = String(body.session_id || "").trim();

    if (!sessionId) return jsonResponse({ error: "session_id is required" }, 400);
    if (!phone && !email) return jsonResponse({ error: "phone or email is required" }, 400);
    if (items.length === 0) return jsonResponse({ error: "cart is empty" }, 400);

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const couponCode = normalizeCouponCode(body.coupon_code);
    const discountAmount = getCouponDiscount(couponCode, subtotal, body.discount_amount);
    const payload = {
      session_id: sessionId,
      customer_name: String(customer.name || "").trim() || null,
      customer_email: email || null,
      customer_phone: phone || null,
      shipping_address: {
        line1: customer.address1 || "",
        line2: customer.address2 || "",
        city: customer.city || "",
        state: customer.state || "",
        pin: customer.pin || "",
        country: customer.country || "India",
        coupon_code: discountAmount > 0 ? couponCode : null,
        discount_amount: discountAmount,
      },
      cart_items: items,
      cart_total: Math.max(0, subtotal - discountAmount + Number(body.delivery_charge || 0)),
      delivery_charge: Number(body.delivery_charge || 0),
      payment_method: body.payment_method || null,
      status: "active",
      last_step: body.last_step || "checkout_started",
      order_id: body.order_id || null,
      page_url: body.page_url || null,
      user_agent: req.headers.get("user-agent") || null,
      updated_at: new Date().toISOString(),
    };

    const url = body.checkout_id
      ? `abandoned_checkouts?id=eq.${encodeURIComponent(body.checkout_id)}`
      : "abandoned_checkouts";
    const res = await dbFetch(supabaseUrl, headers, url, {
      method: body.checkout_id ? "PATCH" : "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    const rows = await res.json();
    return jsonResponse({ checkout: Array.isArray(rows) ? rows[0] : null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
