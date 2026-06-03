type RazorpayOrderBody = {
  order_id?: string;
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

const basicAuth = (keyId: string, keySecret: string) =>
  "Basic " + btoa(`${keyId}:${keySecret}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as RazorpayOrderBody;
    if (!body.order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_live_SvBwWNQkqzmora";
    const razorpayKeySecret = requiredEnv("RAZORPAY_KEY_SECRET");

    const encodedOrderId = encodeURIComponent(body.order_id);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedOrderId}&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);

    const orders = await orderRes.json();
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);
    if (order.payment_status === "paid") return jsonResponse({ error: "Order is already paid" }, 409);

    const amount = Math.round(Number(order.total_amount || 0) * 100);
    if (!Number.isFinite(amount) || amount < 100) {
      return jsonResponse({ error: "Invalid order amount" }, 400);
    }

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: basicAuth(razorpayKeyId, razorpayKeySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: body.order_id,
        notes: {
          supabase_order_id: body.order_id,
          customer_phone: order.customer_phone || "",
          customer_email: order.customer_email || "",
        },
      }),
    });

    const razorpayData = await razorpayRes.json();
    if (!razorpayRes.ok) {
      return jsonResponse({ error: "Razorpay order create failed", details: razorpayData }, 502);
    }

    return jsonResponse({
      razorpay_order_id: razorpayData.id,
      amount: razorpayData.amount,
      currency: razorpayData.currency,
      key_id: razorpayKeyId,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
