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

const formatAddress = (address: Record<string, unknown> | null) => {
  if (!address) return "";
  return [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", "),
    [address.country || "India", address.pin].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join("\n");
};

const addressLines = (address: Record<string, unknown> | null, name = "", phone = "") => {
  if (!address) return [];
  return [
    name,
    address.line1,
    address.line2,
    [address.pin, address.city, address.state].filter(Boolean).join(" "),
    address.country || "India",
    phone,
  ]
    .filter(Boolean)
    .map((value) => String(value));
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

const getEtaText = (createdAt: string) => {
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return "3-5 business days";

  const earliest = new Date(start);
  earliest.setDate(earliest.getDate() + 3);
  const latest = new Date(start);
  latest.setDate(latest.getDate() + 5);

  return `${formatDate(earliest)} - ${formatDate(latest)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const encodedId = encodeURIComponent(order_id);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);

    const orders = await orderRes.json();
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodedId}&select=product_id,quantity,price`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    const orderItems = itemsRes.ok ? await itemsRes.json() : [];
    const productIds = Array.isArray(orderItems)
      ? orderItems.map((item) => item.product_id).filter(Boolean)
      : [];
    let productMap: Record<string, string> = {};

    if (productIds.length) {
      const productRes = await fetch(
        `${supabaseUrl}/rest/v1/products?id=in.(${productIds.map(encodeURIComponent).join(",")})&select=id,name`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
      if (productRes.ok) {
        const products = await productRes.json();
        productMap = Object.fromEntries(products.map((product: { id: string; name: string }) => [product.id, product.name]));
      }
    }

    const shippingAddress = order.shipping_address || null;

    return jsonResponse({
      id: order.id,
      short_id: String(order.id).slice(0, 8).toUpperCase(),
      order_number: String(order.id).slice(0, 8).toUpperCase(),
      customer_name: order.customer_name || "",
      customer_email: order.customer_email || "",
      customer_phone: order.customer_phone || "",
      total_amount: Number(order.total_amount || 0),
      payment_status: order.payment_status,
      order_status: order.order_status,
      payment_id: order.payment_id || "",
      payment_method: `Razorpay - ₹${Number(order.total_amount || 0).toFixed(2)}`,
      shipping_method: "Standard (Prepaid)",
      address: formatAddress(shippingAddress),
      shipping_address_lines: addressLines(shippingAddress, order.customer_name || "", order.customer_phone || ""),
      billing_address_lines: addressLines(shippingAddress, order.customer_name || "", order.customer_phone || ""),
      map_query: addressLines(shippingAddress).slice(1, 4).join(", "),
      eta_text: getEtaText(order.created_at),
      items: Array.isArray(orderItems)
        ? orderItems.map((item) => ({
            product_id: item.product_id,
            name: productMap[item.product_id] || "CaneCreme item",
            quantity: Number(item.quantity || 0),
            price: Number(item.price || 0),
          }))
        : [],
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
