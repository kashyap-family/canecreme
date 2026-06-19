type AdminOrdersBody = {
  admin_password?: string;
  action?: "list" | "detail" | "update_status";
  order_id?: string;
  order_status?: string;
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

const isValidStatus = (status: string) =>
  ["new", "processing", "shipped", "delivered", "cancelled"].includes(status);

const getItemSnapshot = (order: { shipping_address?: { items?: unknown } } | null) => {
  const snapshot = order?.shipping_address?.items;
  if (!Array.isArray(snapshot)) return [];

  return snapshot.map((item) => {
    const row = item as {
      product_id?: unknown;
      name?: unknown;
      quantity?: unknown;
      price?: unknown;
      subtotal?: unknown;
    };
    return {
      product_id: row.product_id || null,
      quantity: Number(row.quantity || 0),
      price: Number(row.price || 0),
      subtotal: Number(row.subtotal || 0),
      products: {
        name: String(row.name || "Product"),
        price: Number(row.price || 0),
      },
      source: "order_snapshot",
    };
  }).filter((item) => item.quantity > 0 && item.price > 0);
};

const getInferredItems = async (
  supabaseUrl: string,
  headers: Record<string, string>,
  order: { total_amount?: unknown; shipping_address?: { delivery_charge?: unknown } } | null,
) => {
  if (!order) return [];

  const total = Number(order.total_amount || 0);
  const deliveryCharge = Number(order.shipping_address?.delivery_charge || 0);
  const productSubtotal = Math.max(0, total - deliveryCharge);
  if (!Number.isFinite(productSubtotal) || productSubtotal <= 0) return [];

  const res = await fetch(
    `${supabaseUrl}/rest/v1/products?select=id,name,price&price=eq.${encodeURIComponent(String(productSubtotal))}`,
    { headers },
  );
  if (!res.ok) return [];

  const products = await res.json() as Array<{ id?: string; name?: string; price?: number }>;
  if (!Array.isArray(products) || products.length === 0) return [];

  const productNames = products.map((product) => product.name).filter(Boolean).join(" / ");
  return [{
    product_id: products.length === 1 ? products[0].id || null : null,
    quantity: 1,
    price: productSubtotal,
    subtotal: productSubtotal,
    products: {
      name: products.length === 1 ? productNames : `Possible: ${productNames}`,
      price: productSubtotal,
    },
    source: "price_inference",
  }];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as AdminOrdersBody;
    const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "canecreme2026";
    if (body.admin_password !== expectedPassword) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };
    const action = body.action || "list";

    if (action === "list") {
      const res = await fetch(`${supabaseUrl}/rest/v1/orders?select=*&order=created_at.desc`, { headers });
      if (!res.ok) throw new Error(`Orders lookup failed: ${await res.text()}`);
      return jsonResponse({ orders: await res.json() });
    }

    if (action === "detail") {
      if (!body.order_id) return jsonResponse({ error: "order_id is required" }, 400);
      const encodedId = encodeURIComponent(body.order_id);
      const [orderRes, itemsRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}&limit=1`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodedId}&select=*,products(name,price)`, { headers }),
      ]);
      if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);
      if (!itemsRes.ok) throw new Error(`Items lookup failed: ${await itemsRes.text()}`);
      const orders = await orderRes.json();
      const order = orders[0] || null;
      const items = await itemsRes.json();
      const savedItems = Array.isArray(items) && items.length > 0 ? items : getItemSnapshot(order);
      return jsonResponse({
        order,
        items: savedItems.length > 0 ? savedItems : await getInferredItems(supabaseUrl, headers, order),
      });
    }

    if (action === "update_status") {
      if (!body.order_id) return jsonResponse({ error: "order_id is required" }, 400);
      const status = body.order_status || "";
      if (!isValidStatus(status)) return jsonResponse({ error: "Invalid order status" }, 400);
      const encodedId = encodeURIComponent(body.order_id);
      const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ order_status: status }),
      });
      if (!res.ok) throw new Error(`Order status update failed: ${await res.text()}`);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
