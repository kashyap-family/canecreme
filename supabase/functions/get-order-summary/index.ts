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

    return jsonResponse({
      id: order.id,
      short_id: String(order.id).slice(0, 8).toUpperCase(),
      total_amount: Number(order.total_amount || 0),
      payment_status: order.payment_status,
      order_status: order.order_status,
      address: formatAddress(order.shipping_address || null),
      eta_text: getEtaText(order.created_at),
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
