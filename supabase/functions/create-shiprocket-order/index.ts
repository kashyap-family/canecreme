type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pin?: string;
    country?: string;
  };
  total_amount: number;
  payment_status: string;
  payment_id?: string | null;
};

type OrderItem = {
  quantity: number;
  price: number;
  products?: {
    name?: string;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const shiprocketEmail = requiredEnv("SHIPROCKET_EMAIL");
    const shiprocketPassword = requiredEnv("SHIPROCKET_PASSWORD");

    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}&limit=1`, {
      headers: dbHeaders,
    });
    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);

    const orders = await orderRes.json() as Order[];
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);
    if (order.payment_status !== "paid") {
      return jsonResponse({ error: "Order is not paid yet" }, 409);
    }

    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${order_id}&select=quantity,price,products(name)`,
      { headers: dbHeaders },
    );
    if (!itemsRes.ok) throw new Error(`Order items lookup failed: ${await itemsRes.text()}`);
    const items = await itemsRes.json() as OrderItem[];

    const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: shiprocketEmail,
        password: shiprocketPassword,
      }),
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.token) {
      return jsonResponse({ error: "Shiprocket authentication failed", details: authData }, 502);
    }

    const addr = order.shipping_address || {};
    const orderItems = items.map((item, index) => ({
      name: item.products?.name || `CaneCreme Item ${index + 1}`,
      sku: `CC-${order.id.slice(0, 8)}-${index + 1}`,
      units: item.quantity,
      selling_price: Number(item.price),
    }));

    const today = new Date();
    const payload = {
      order_id: order.id,
      order_date: formatDate(today),
      pickup_location: Deno.env.get("SHIPROCKET_PICKUP_LOCATION") || "Primary",
      channel_id: "",
      comment: `CaneCreme website order. Payment ID: ${order.payment_id || "N/A"}`,
      billing_customer_name: order.customer_name,
      billing_last_name: "",
      billing_address: addr.line1 || "",
      billing_address_2: addr.line2 || "",
      billing_city: addr.city || "",
      billing_pincode: addr.pin || "",
      billing_state: addr.state || "",
      billing_country: addr.country || "India",
      billing_email: order.customer_email,
      billing_phone: order.customer_phone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: "Prepaid",
      shipping_charges: 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: 0,
      sub_total: Number(order.total_amount),
      length: Number(Deno.env.get("SHIPROCKET_PACKAGE_LENGTH_CM") || 12),
      breadth: Number(Deno.env.get("SHIPROCKET_PACKAGE_BREADTH_CM") || 12),
      height: Number(Deno.env.get("SHIPROCKET_PACKAGE_HEIGHT_CM") || 8),
      weight: Number(Deno.env.get("SHIPROCKET_PACKAGE_WEIGHT_KG") || 0.5),
      expected_delivery_date: formatDate(addDays(today, 5)),
    };

    const createRes = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authData.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      return jsonResponse({ error: "Shiprocket order creation failed", details: createData }, 502);
    }

    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ order_status: "processing" }),
    });

    return jsonResponse({ ok: true, shiprocket: createData });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
