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

const basicAuth = (keyId: string, keySecret: string) =>
  "Basic " + btoa(`${keyId}:${keySecret}`);

const dbFetch = async (supabaseUrl: string, headers: HeadersInit, path: string, init: RequestInit = {}) => {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJsonMaybe = (value: string) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return value;
  }
};

const sendOrderEmailWithRetry = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
) => {
  let lastStatus = 0;
  let lastText = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-order-email`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId, email_type: "order_confirmation" }),
    });
    const emailText = await emailRes.text();
    if (emailRes.ok) {
      return {
        ok: true,
        attempts: attempt,
        response: parseJsonMaybe(emailText),
      };
    }

    lastStatus = emailRes.status;
    lastText = emailText;
    if (attempt < 3) await sleep(650 * attempt);
  }

  return {
    ok: false,
    attempts: 3,
    status: lastStatus,
    error: lastText,
  };
};

const claimOrderSideEffect = async (
  supabaseUrl: string,
  headers: Record<string, string>,
  orderId: string,
  effectType: "order_confirmation_email" | "rapidshyp_order",
) => {
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/order_side_effects`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orderId,
      effect_type: effectType,
      status: "processing",
      updated_at: new Date().toISOString(),
    }),
  });

  if (insertRes.ok) return true;
  if (insertRes.status !== 409) {
    throw new Error(`Side effect claim failed: ${await insertRes.text()}`);
  }

  const existingRes = await dbFetch(
    supabaseUrl,
    headers,
    `order_side_effects?select=id,status&order_id=eq.${encodeURIComponent(orderId)}&effect_type=eq.${encodeURIComponent(effectType)}&limit=1`,
  );
  const rows = await existingRes.json();
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (!existing || existing.status !== "failed") return false;

  const retryRes = await fetch(`${supabaseUrl}/rest/v1/order_side_effects?id=eq.${encodeURIComponent(existing.id)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "processing",
      last_error: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!retryRes.ok) throw new Error(`Side effect retry claim failed: ${await retryRes.text()}`);
  return true;
};

const finishOrderSideEffect = async (
  supabaseUrl: string,
  headers: Record<string, string>,
  orderId: string,
  effectType: "order_confirmation_email" | "rapidshyp_order",
  status: "completed" | "failed",
  metadata: Record<string, unknown> = {},
  lastError = "",
) => {
  await fetch(
    `${supabaseUrl}/rest/v1/order_side_effects?order_id=eq.${encodeURIComponent(orderId)}&effect_type=eq.${encodeURIComponent(effectType)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        status,
        metadata,
        last_error: lastError || null,
        updated_at: new Date().toISOString(),
      }),
    },
  ).catch((error) => console.warn("Side effect status update skipped:", error.message));
};

const processPostPaymentSideEffects = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  headers: Record<string, string>,
  orderId: string,
) => {
  const result = {
    email_sent: false,
    email_skipped: false,
    email: null as unknown,
    rapidshyp_created: false,
    rapidshyp_skipped: false,
    rapidshyp: null as unknown,
    rapidshyp_error: "",
  };

  if (await claimOrderSideEffect(supabaseUrl, headers, orderId, "order_confirmation_email")) {
    const emailResult = await sendOrderEmailWithRetry(supabaseUrl, serviceRoleKey, orderId);
    result.email_sent = emailResult.ok;
    result.email = emailResult;
    await finishOrderSideEffect(
      supabaseUrl,
      headers,
      orderId,
      "order_confirmation_email",
      emailResult.ok ? "completed" : "failed",
      { attempts: emailResult.attempts, response: emailResult.ok ? emailResult.response : null },
      emailResult.ok ? "" : JSON.stringify(emailResult),
    );
  } else {
    result.email_skipped = true;
  }

  if (await claimOrderSideEffect(supabaseUrl, headers, orderId, "rapidshyp_order")) {
    const rapidshypRes = await fetch(`${supabaseUrl}/functions/v1/create-rapidshyp-order`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    });
    const rapidshypText = await rapidshypRes.text();
    result.rapidshyp_created = rapidshypRes.ok;
    result.rapidshyp = parseJsonMaybe(rapidshypText);
    result.rapidshyp_error = rapidshypRes.ok ? "" : rapidshypText;
    await finishOrderSideEffect(
      supabaseUrl,
      headers,
      orderId,
      "rapidshyp_order",
      rapidshypRes.ok ? "completed" : "failed",
      { response: result.rapidshyp },
      rapidshypRes.ok ? "" : rapidshypText,
    );
  } else {
    result.rapidshyp_skipped = true;
  }

  return result;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { order_id, payment_id, razorpay_order_id, razorpay_signature } = await req.json();
    if (!order_id || !payment_id) {
      return jsonResponse({ error: "order_id and payment_id are required" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_live_SvBwWNQkqzmora";
    const razorpayKeySecret = requiredEnv("RAZORPAY_KEY_SECRET");
    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const encodedOrderId = encodeURIComponent(order_id);
    const orderRes = await dbFetch(
      supabaseUrl,
      dbHeaders,
      `orders?select=id,total_amount,payment_status,order_status,razorpay_order_id&id=eq.${encodedOrderId}&limit=1`,
    );
    const orders = await orderRes.json();
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    if (order.payment_status === "paid") {
      return jsonResponse({ ok: true, order_paid: true, already_paid: true });
    }

    let verifiedBy = "";
    if (razorpay_order_id || razorpay_signature) {
      if (!razorpay_order_id || !razorpay_signature) {
        return jsonResponse({ error: "Razorpay order ID and signature are required" }, 400);
      }
      if (order.razorpay_order_id && order.razorpay_order_id !== razorpay_order_id) {
        return jsonResponse({ error: "Razorpay order does not match this order" }, 409);
      }

      const signatureOk = await verifyRazorpaySignature(
        razorpay_order_id,
        payment_id,
        razorpay_signature,
        razorpayKeySecret,
      );
      if (!signatureOk) {
        return jsonResponse({ error: "Razorpay signature verification failed" }, 401);
      }
      verifiedBy = "checkout_signature";
    } else {
      const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payment_id)}`, {
        headers: { Authorization: basicAuth(razorpayKeyId, razorpayKeySecret) },
      });
      const payment = await paymentRes.json();
      if (!paymentRes.ok) {
        return jsonResponse({ error: "Razorpay payment lookup failed", details: payment }, 502);
      }
      const linkedOrderId = payment.order_id || "";
      const linkedLocalOrder = payment.notes?.supabase_order_id || payment.notes?.order_id || "";
      if (
        (order.razorpay_order_id && linkedOrderId !== order.razorpay_order_id) ||
        (!order.razorpay_order_id && linkedLocalOrder !== order_id)
      ) {
        return jsonResponse({ error: "Razorpay payment does not belong to this order" }, 409);
      }
      if (payment.status !== "captured" && payment.captured !== true) {
        return jsonResponse({ error: "Razorpay payment is not captured yet", status: payment.status }, 409);
      }
      verifiedBy = "razorpay_payment_api";
    }

    await dbFetch(supabaseUrl, dbHeaders, "payment_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        order_id,
        provider: "razorpay",
        provider_order_id: razorpay_order_id || order.razorpay_order_id || null,
        provider_payment_id: payment_id,
        event_type: "checkout.verified",
        amount: Number(order.total_amount || 0),
        currency: "INR",
        status: "verified",
        raw_payload: { verified_by: verifiedBy },
        processed_at: new Date().toISOString(),
      }),
    }).catch((error) => console.warn("Payment event insert skipped:", error.message));

    const paidRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedOrderId}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        payment_id,
        payment_status: "paid",
        order_status: "processing",
        razorpay_order_id: razorpay_order_id || order.razorpay_order_id || null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!paidRes.ok) throw new Error(`Payment status update failed: ${await paidRes.text()}`);

    const sideEffects = await processPostPaymentSideEffects(supabaseUrl, serviceRoleKey, dbHeaders, order_id);
    if (!sideEffects.rapidshyp_created && !sideEffects.rapidshyp_skipped) {
      return jsonResponse({
        ok: true,
        order_paid: true,
        ...sideEffects,
      }, 207);
    }

    return jsonResponse({
      ok: true,
      order_paid: true,
      ...sideEffects,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
