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

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyRazorpaySignature = async (
  razorpayOrderId: string,
  paymentId: string,
  signature: string,
  secret: string,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${razorpayOrderId}|${paymentId}`),
  );
  return toHex(signed) === signature;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { order_id, payment_id, razorpay_order_id, razorpay_signature } = await req.json();
    if (!order_id || !payment_id) {
      return jsonResponse({ error: "order_id and payment_id are required" }, 400);
    }

    if (razorpay_order_id || razorpay_signature) {
      if (!razorpay_order_id || !razorpay_signature) {
        return jsonResponse({ error: "Razorpay order ID and signature are required" }, 400);
      }

      const razorpayKeySecret = requiredEnv("RAZORPAY_KEY_SECRET");
      const signatureOk = await verifyRazorpaySignature(
        razorpay_order_id,
        payment_id,
        razorpay_signature,
        razorpayKeySecret,
      );
      if (!signatureOk) {
        return jsonResponse({ error: "Razorpay signature verification failed" }, 401);
      }
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
        order_paid: true,
        rapidshyp_created: false,
        rapidshyp_error: rapidshypText,
      }, 207);
    }

    return jsonResponse({
      ok: true,
      order_paid: true,
      rapidshyp_created: true,
      rapidshyp: rapidshypText ? JSON.parse(rapidshypText) : null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
