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
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const encodedId = encodeURIComponent(order_id);
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const codRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        payment_id: "COD",
        payment_status: "cod",
        order_status: "processing",
      }),
    });
    if (!codRes.ok) throw new Error(`COD status update failed: ${await codRes.text()}`);

    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id, email_type: "order_confirmation" }),
    });
    const emailText = await emailRes.text();

    const rapidshypRes = await fetch(`${supabaseUrl}/functions/v1/create-rapidshyp-order`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id }),
    });

    const rapidshypText = await rapidshypRes.text();
    if (!rapidshypRes.ok) {
      return jsonResponse({
        ok: true,
        order_cod: true,
        email_sent: emailRes.ok,
        email_error: emailRes.ok ? undefined : emailText,
        rapidshyp_created: false,
        rapidshyp_error: rapidshypText,
      }, 207);
    }

    return jsonResponse({
      ok: true,
      order_cod: true,
      email_sent: emailRes.ok,
      email_error: emailRes.ok ? undefined : emailText,
      rapidshyp_created: true,
      rapidshyp: rapidshypText ? JSON.parse(rapidshypText) : null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
