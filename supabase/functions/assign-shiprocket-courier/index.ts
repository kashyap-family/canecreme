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
    const { shipment_id, courier_id } = await req.json();
    if (!shipment_id) return jsonResponse({ error: "shipment_id is required" }, 400);

    const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: requiredEnv("SHIPROCKET_EMAIL"),
        password: requiredEnv("SHIPROCKET_PASSWORD"),
      }),
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.token) {
      return jsonResponse({ error: "Shiprocket authentication failed", details: authData }, 502);
    }

    const payload: Record<string, unknown> = { shipment_id };
    if (courier_id) payload.courier_id = courier_id;

    const assignRes = await fetch("https://apiv2.shiprocket.in/v1/external/courier/assign/awb", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authData.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const assignData = await assignRes.json();
    if (!assignRes.ok) {
      return jsonResponse({ error: "Shiprocket courier assignment failed", details: assignData }, 502);
    }

    return jsonResponse({ ok: true, assignment: assignData });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
