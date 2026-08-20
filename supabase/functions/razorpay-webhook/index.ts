type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: Record<string, unknown>;
    };
    order?: {
      entity?: Record<string, unknown>;
    };
  };
  created_at?: number;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyWebhookSignature = async (rawBody: string, signature: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return toHex(signed) === signature;
};

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

const applyOrderStockSale = async (
  supabaseUrl: string,
  headers: HeadersInit,
  orderId: string,
) => {
  const res = await dbFetch(supabaseUrl, headers, "rpc/apply_order_stock_sale", {
    method: "POST",
    body: JSON.stringify({ p_order_id: orderId }),
  });
  return await res.json();
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

const processPostPaymentSideEffects = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  headers: Record<string, string>,
  orderId: string,
) => {
  const result = {
    email_sent: false,
    email_skipped: false,
    rapidshyp_created: false,
    rapidshyp_skipped: false,
    rapidshyp_error: "",
  };

  if (await claimOrderSideEffect(supabaseUrl, headers, orderId, "order_confirmation_email")) {
    const emailResult = await sendOrderEmailWithRetry(supabaseUrl, serviceRoleKey, orderId);
    result.email_sent = emailResult.ok;
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
    result.rapidshyp_error = rapidshypRes.ok ? "" : rapidshypText;
    await finishOrderSideEffect(
      supabaseUrl,
      headers,
      orderId,
      "rapidshyp_order",
      rapidshypRes.ok ? "completed" : "failed",
      { response: parseJsonMaybe(rapidshypText) },
      rapidshypRes.ok ? "" : rapidshypText,
    );
  } else {
    result.rapidshyp_skipped = true;
  }

  return result;
};

const getPaymentEntity = (payload: RazorpayWebhookPayload) =>
  payload.payload?.payment?.entity || null;

const getRazorpayOrderId = (payload: RazorpayWebhookPayload, payment: Record<string, unknown> | null) =>
  String(payment?.order_id || payload.payload?.order?.entity?.id || "");

const getLocalOrderId = (payment: Record<string, unknown> | null) =>
  String(
    (payment?.notes as Record<string, unknown> | undefined)?.supabase_order_id ||
    (payment?.notes as Record<string, unknown> | undefined)?.order_id ||
    "",
  );

const insertPaymentEvent = async (
  supabaseUrl: string,
  headers: HeadersInit,
  eventId: string,
  eventType: string,
  orderId: string | null,
  payment: Record<string, unknown> | null,
  payload: RazorpayWebhookPayload,
) => {
  const providerPaymentId = payment?.id ? String(payment.id) : null;
  const providerOrderId = getRazorpayOrderId(payload, payment) || null;
  const existingFilter = eventId
    ? `provider=eq.razorpay&provider_event_id=eq.${encodeURIComponent(eventId)}&limit=1`
    : providerPaymentId
      ? `provider=eq.razorpay&provider_payment_id=eq.${encodeURIComponent(providerPaymentId)}&event_type=eq.${encodeURIComponent(eventType)}&limit=1`
      : "";

  if (existingFilter) {
    const existingRes = await dbFetch(supabaseUrl, headers, `payment_events?select=id&${existingFilter}`);
    const existing = await existingRes.json();
    if (Array.isArray(existing) && existing.length > 0) return { inserted: false };
  }

  await dbFetch(supabaseUrl, headers, "payment_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orderId,
      provider: "razorpay",
      provider_event_id: eventId || null,
      provider_order_id: providerOrderId,
      provider_payment_id: providerPaymentId,
      event_type: eventType,
      amount: Number(payment?.amount || 0) / 100 || null,
      currency: String(payment?.currency || "INR"),
      status: String(payment?.status || eventType),
      raw_payload: payload,
      processed_at: new Date().toISOString(),
    }),
  });

  return { inserted: true };
};

const findOrder = async (
  supabaseUrl: string,
  headers: HeadersInit,
  razorpayOrderId: string,
  localOrderId: string,
) => {
  const filter = razorpayOrderId
    ? `razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}`
    : localOrderId
      ? `id=eq.${encodeURIComponent(localOrderId)}`
      : "";
  if (!filter) return null;

  const res = await dbFetch(
    supabaseUrl,
    headers,
    `orders?select=id,total_amount,payment_status,order_status,razorpay_order_id&${filter}&limit=1`,
  );
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : null;
};

const markOrderPaid = async (
  supabaseUrl: string,
  headers: HeadersInit,
  order: Record<string, unknown>,
  payment: Record<string, unknown>,
  razorpayOrderId: string,
) => {
  if (order.payment_status === "paid") return { updated: false, already_paid: true };

  await dbFetch(supabaseUrl, headers, `orders?id=eq.${encodeURIComponent(String(order.id))}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      payment_id: String(payment.id || ""),
      payment_status: "paid",
      order_status: order.order_status === "cancelled" ? order.order_status : "processing",
      razorpay_order_id: razorpayOrderId || order.razorpay_order_id || null,
      updated_at: new Date().toISOString(),
    }),
  });

  return { updated: true, already_paid: false };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const eventId = req.headers.get("x-razorpay-event-id") || "";
    if (!signature) return jsonResponse({ error: "Missing Razorpay signature" }, 401);

    const webhookSecret = requiredEnv("RAZORPAY_WEBHOOK_SECRET");
    const signatureOk = await verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!signatureOk) return jsonResponse({ error: "Invalid Razorpay signature" }, 401);

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const eventType = String(payload.event || "");
    const payment = getPaymentEntity(payload);
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    if (!["payment.captured", "order.paid"].includes(eventType)) {
      await insertPaymentEvent(supabaseUrl, headers, eventId, eventType || "unknown", null, payment, payload)
        .catch((error) => console.warn("Non-paid payment event insert skipped:", error.message));
      return jsonResponse({ ok: true, ignored: true, event: eventType });
    }

    const razorpayOrderId = getRazorpayOrderId(payload, payment);
    const localOrderId = getLocalOrderId(payment);
    const order = await findOrder(supabaseUrl, headers, razorpayOrderId, localOrderId);
    if (!order) {
      await insertPaymentEvent(supabaseUrl, headers, eventId, eventType, null, payment, payload)
        .catch((error) => console.warn("Unmatched payment event insert skipped:", error.message));
      return jsonResponse({ ok: true, matched: false, event: eventType });
    }

    const eventResult = await insertPaymentEvent(
      supabaseUrl,
      headers,
      eventId,
      eventType,
      String(order.id),
      payment,
      payload,
    );
    if (!eventResult.inserted) {
      return jsonResponse({ ok: true, duplicate: true, event: eventType });
    }

    const paymentStatus = String(payment?.status || "");
    const captured = paymentStatus === "captured" || payment?.captured === true || eventType === "order.paid";
    if (!captured || !payment?.id) {
      return jsonResponse({ ok: true, matched: true, paid: false, status: paymentStatus });
    }

    const updateResult = await markOrderPaid(supabaseUrl, headers, order, payment, razorpayOrderId);
    const stockResult = await applyOrderStockSale(supabaseUrl, headers, String(order.id));
    const sideEffects = updateResult.already_paid
      ? { email_sent: false, email_skipped: true, rapidshyp_created: false, rapidshyp_skipped: true }
      : await processPostPaymentSideEffects(supabaseUrl, serviceRoleKey, headers, String(order.id));
    console.log(JSON.stringify({
      level: "info",
      message: "razorpay_payment_synced",
      event_id: eventId,
      event: eventType,
      order_id: order.id,
      payment_id: payment.id,
      updated: updateResult.updated,
      stock: stockResult,
      side_effects: sideEffects,
    }));

    return jsonResponse({ ok: true, matched: true, paid: true, stock: stockResult, ...updateResult, ...sideEffects });
  } catch (error) {
    console.error("Razorpay webhook failed:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
