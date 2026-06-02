type HistoryBody = {
  phone: string;
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

const normalizePhone = (phone: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as HistoryBody;
    const phone = normalizePhone(body.phone);

    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      return jsonResponse({ error: "Invalid mobile number" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "id,total_amount,payment_status,order_status,shipping_address",
      customer_phone: `eq.${phone}`,
      limit: "5",
    });

    const ordersRes = await fetch(`${supabaseUrl}/rest/v1/orders?${params.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!ordersRes.ok) throw new Error(`Order history lookup failed: ${await ordersRes.text()}`);

    const rows = await ordersRes.json();
    const orders = rows.map((order: Record<string, unknown>) => {
      const address = (order.shipping_address || {}) as Record<string, unknown>;
      return {
        short_id: String(order.id || "").slice(0, 8),
        total: order.total_amount,
        status: order.payment_status || order.order_status || "",
        pin: address.pin || "",
      };
    });

    return jsonResponse({ found: orders.length > 0, orders });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
