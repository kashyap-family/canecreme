type CheckoutItem = {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
};

type AbandonedCheckoutBody = {
  admin_password?: string;
  action?: "upsert" | "complete" | "list";
  checkout_id?: string;
  session_id?: string;
  order_id?: string;
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

const cleanPhone = (phone?: string) => String(phone || "").replace(/\D/g, "").slice(0, 10);

const normalizeItems = (items: CheckoutItem[] = []) =>
  items.map((item, index) => {
    const price = Number(item.price || 0);
    const quantity = Number(item.quantity || 0);
    return {
      product_id: item.id || null,
      name: String(item.name || `CaneCreme Item ${index + 1}`),
      quantity,
      price,
      subtotal: price * quantity,
    };
  }).filter((item) => item.quantity > 0 && item.price > 0);

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
      const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "canecreme2026";
      if (body.admin_password !== expectedPassword) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const res = await fetch(
        `${supabaseUrl}/rest/v1/abandoned_checkouts?select=*&status=eq.active&order=updated_at.desc&limit=200`,
        { headers },
      );
      if (!res.ok) throw new Error(`Abandoned checkout lookup failed: ${await res.text()}`);
      return jsonResponse({ checkouts: await res.json() });
    }

    if (action === "complete") {
      if (!body.checkout_id && !body.session_id && !body.order_id) {
        return jsonResponse({ error: "checkout_id, session_id, or order_id is required" }, 400);
      }

      const patch = {
        status: "completed",
        order_id: body.order_id || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const filter = body.checkout_id
        ? `id=eq.${encodeURIComponent(body.checkout_id)}`
        : body.order_id
          ? `order_id=eq.${encodeURIComponent(body.order_id)}`
          : `session_id=eq.${encodeURIComponent(body.session_id || "")}&status=eq.active`;

      const res = await fetch(`${supabaseUrl}/rest/v1/abandoned_checkouts?${filter}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Abandoned checkout completion failed: ${await res.text()}`);
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
      },
      cart_items: items,
      cart_total: subtotal + Number(body.delivery_charge || 0),
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
      ? `${supabaseUrl}/rest/v1/abandoned_checkouts?id=eq.${encodeURIComponent(body.checkout_id)}`
      : `${supabaseUrl}/rest/v1/abandoned_checkouts`;
    const res = await fetch(url, {
      method: body.checkout_id ? "PATCH" : "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Abandoned checkout save failed: ${await res.text()}`);

    const rows = await res.json();
    return jsonResponse({ checkout: Array.isArray(rows) ? rows[0] : null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
