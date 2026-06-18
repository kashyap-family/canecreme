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
    delivery_charge?: number;
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

const optionalNumberEnv = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getRapidShypEndpoint = () => {
  const configured = Deno.env.get("RAPIDSHYP_CREATE_ORDER_URL")?.trim();
  if (configured) return configured;

  throw new Error("Missing RAPIDSHYP_CREATE_ORDER_URL");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const rapidshypToken = requiredEnv("RAPIDSHYP_API_TOKEN");
    const rapidshypEndpoint = getRapidShypEndpoint();

    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const encodedId = encodeURIComponent(order_id);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}&limit=1`, {
      headers: dbHeaders,
    });
    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);

    const orders = await orderRes.json() as Order[];
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const isCodOrder = order.payment_status === "cod";
    if (order.payment_status !== "paid" && !isCodOrder) {
      return jsonResponse({ error: "Order is not ready for shipping yet" }, 409);
    }

    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodedId}&select=quantity,price,products(name)`,
      { headers: dbHeaders },
    );
    if (!itemsRes.ok) throw new Error(`Order items lookup failed: ${await itemsRes.text()}`);
    const items = await itemsRes.json() as OrderItem[];

    const addr = order.shipping_address || {};
    const deliveryCharge = Number(addr.delivery_charge || 0);
    const productSubtotal = Math.max(0, Number(order.total_amount || 0) - deliveryCharge);
    const shortId = String(order.id).slice(0, 8).toUpperCase();
    const today = new Date();

    const payload = {
      order_id: order.id,
      order_number: shortId,
      order_date: formatDate(today),
      pickup_location: Deno.env.get("RAPIDSHYP_PICKUP_LOCATION") || "CaneCreme",
      payment_method: isCodOrder ? "COD" : "Prepaid",
      cod_amount: isCodOrder ? Number(order.total_amount || 0) : 0,
      shipping_charges: deliveryCharge,
      sub_total: productSubtotal,
      total_amount: Number(order.total_amount || 0),
      customer: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },
      shipping_address: {
        name: order.customer_name,
        address1: addr.line1 || "",
        address2: addr.line2 || "",
        city: addr.city || "",
        state: addr.state || "",
        pincode: addr.pin || "",
        country: addr.country || "India",
        phone: order.customer_phone,
        email: order.customer_email,
      },
      billing_address_same_as_shipping: true,
      order_items: items.map((item, index) => ({
        name: item.products?.name || `CaneCreme Item ${index + 1}`,
        sku: `CC-${shortId}-${index + 1}`,
        units: Number(item.quantity || 0),
        selling_price: Number(item.price || 0),
      })),
      package: {
        length_cm: optionalNumberEnv("RAPIDSHYP_PACKAGE_LENGTH_CM", 12),
        breadth_cm: optionalNumberEnv("RAPIDSHYP_PACKAGE_BREADTH_CM", 12),
        height_cm: optionalNumberEnv("RAPIDSHYP_PACKAGE_HEIGHT_CM", 8),
        weight_kg: optionalNumberEnv("RAPIDSHYP_PACKAGE_WEIGHT_KG", 0.5),
      },
      note: isCodOrder
        ? "CaneCreme website COD order."
        : `CaneCreme website prepaid order. Payment ID: ${order.payment_id || "N/A"}`,
    };

    const createRes = await fetch(rapidshypEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rapidshypToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const createText = await createRes.text();
    let createData: unknown = createText;
    try {
      createData = createText ? JSON.parse(createText) : null;
    } catch {
      createData = createText;
    }

    if (!createRes.ok) {
      return jsonResponse({ error: "RapidShyp order creation failed", details: createData }, 502);
    }

    return jsonResponse({ ok: true, rapidshyp: createData });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
