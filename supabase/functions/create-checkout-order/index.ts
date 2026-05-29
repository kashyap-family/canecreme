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

    const total = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    if (!Number.isFinite(total) || total < 1) {
      return jsonResponse({ error: "Invalid order total" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

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
        },
        total_amount: total,
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
