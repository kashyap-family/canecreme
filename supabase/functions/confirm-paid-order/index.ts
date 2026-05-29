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
    const { order_id, payment_id } = await req.json();
    if (!order_id || !payment_id) {
      return jsonResponse({ error: "order_id and payment_id are required" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const paidRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        payment_id,
        payment_status: "paid",
        order_status: "processing",
      }),
    });
    if (!paidRes.ok) throw new Error(`Payment status update failed: ${await paidRes.text()}`);

    const shiprocketRes = await fetch(`${supabaseUrl}/functions/v1/create-shiprocket-order`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id }),
    });

    const shiprocketText = await shiprocketRes.text();
    if (!shiprocketRes.ok) {
      return jsonResponse({
        ok: true,
        order_paid: true,
        shiprocket_created: false,
        shiprocket_error: shiprocketText,
      }, 207);
    }

    return jsonResponse({
      ok: true,
      order_paid: true,
      shiprocket_created: true,
      shiprocket: shiprocketText ? JSON.parse(shiprocketText) : null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
