type SendOrderEmailBody = {
  order_id?: string;
  admin_password?: string;
  email_type?: "order_confirmation" | "status_update";
};

type OrderRow = {
  id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_address?: Record<string, unknown>;
  total_amount?: number;
  payment_status?: string;
  order_status?: string;
  payment_id?: string | null;
  created_at?: string;
};

type OrderItemRow = {
  quantity?: number;
  price?: number;
  product_id?: string;
  products?: { name?: string; price?: number } | null;
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

const formatMoney = (value: unknown) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isRealCustomerEmail = (email: string) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (/@canecreme\.local$/i.test(email)) return false;
  if (/^(customer-|trial-|codex-)/i.test(email)) return false;
  if (/@(example|test)\./i.test(email)) return false;
  return true;
};

const addressText = (address?: Record<string, unknown>) =>
  [
    address?.line1,
    address?.line2,
    [address?.city, address?.state, address?.pin].filter(Boolean).join(" "),
    address?.country || "India",
  ].filter(Boolean).join(", ");

const getItemSnapshot = (order: OrderRow) => {
  const snapshot = order.shipping_address?.items;
  if (!Array.isArray(snapshot)) return [];

  return snapshot.map((item) => {
    const row = item as { name?: unknown; quantity?: unknown; price?: unknown };
    return {
      quantity: Number(row.quantity || 0),
      price: Number(row.price || 0),
      products: { name: String(row.name || "CaneCreme item") },
    };
  }).filter((item) => item.quantity > 0);
};

const renderItems = (items: OrderItemRow[]) => {
  if (!items.length) {
    return {
      html: `<tr><td colspan="3" style="padding:12px;border-top:1px solid #eee;color:#666;">Item details are being prepared.</td></tr>`,
      text: "Items: Details being prepared.",
    };
  }

  return {
    html: items.map((item) => {
      const name = item.products?.name || "CaneCreme item";
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return `
        <tr>
          <td style="padding:12px;border-top:1px solid #eee;">${escapeHtml(name)}</td>
          <td style="padding:12px;border-top:1px solid #eee;text-align:center;">${quantity}</td>
          <td style="padding:12px;border-top:1px solid #eee;text-align:right;">${formatMoney(price * quantity)}</td>
        </tr>
      `;
    }).join(""),
    text: items.map((item) => {
      const name = item.products?.name || "CaneCreme item";
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return `${name} x ${quantity} - ${formatMoney(price * quantity)}`;
    }).join("\n"),
  };
};

const buildEmail = (order: OrderRow, items: OrderItemRow[], emailType: string) => {
  const shortId = String(order.id).slice(0, 8).toUpperCase();
  const customerName = order.customer_name || "there";
  const address = addressText(order.shipping_address);
  const paymentLabel = order.payment_status === "cod" ? "Cash on Delivery" : "Online payment";
  const itemRows = renderItems(items);
  const isStatusUpdate = emailType === "status_update";
  const subject = isStatusUpdate
    ? `CaneCreme order ${shortId} update`
    : `CaneCreme order ${shortId} confirmed`;
  const heading = isStatusUpdate ? "Your order has been updated" : "Your CaneCreme order is confirmed";
  const intro = isStatusUpdate
    ? `Your order status is now ${order.order_status || "processing"}.`
    : "Thank you for ordering from CaneCreme. We have received your order and will begin preparing it shortly.";

  const html = `
    <div style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#151515;">
      <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
        <div style="background:#111;color:#BAD50D;padding:18px 22px;border-radius:8px 8px 0 0;font-weight:700;font-size:20px;">
          CaneCreme
        </div>
        <div style="background:#fff;padding:24px 22px;border:1px solid #ececec;border-top:0;border-radius:0 0 8px 8px;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#111;">${heading}</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">Hi ${escapeHtml(customerName)}, ${escapeHtml(intro)}</p>
          <div style="display:block;background:#f8faf0;border:1px solid #e4ef9a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
            <strong>Order ${shortId}</strong><br>
            Total: ${formatMoney(order.total_amount)}<br>
            Payment: ${escapeHtml(paymentLabel)}<br>
            Status: ${escapeHtml(order.order_status || "processing")}
          </div>
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <thead>
              <tr>
                <th style="padding:10px 12px;text-align:left;background:#fafafa;border-top:1px solid #eee;">Product</th>
                <th style="padding:10px 12px;text-align:center;background:#fafafa;border-top:1px solid #eee;">Qty</th>
                <th style="padding:10px 12px;text-align:right;background:#fafafa;border-top:1px solid #eee;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows.html}</tbody>
          </table>
          <h2 style="margin:0 0 8px;font-size:16px;">Delivery Address</h2>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#333;">${escapeHtml(address || "Saved with your order")}</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#666;">Need help? Reply to this email or contact CaneCreme support.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    `CaneCreme - ${subject}`,
    "",
    `Hi ${customerName},`,
    intro,
    "",
    `Order: ${shortId}`,
    `Total: ${formatMoney(order.total_amount)}`,
    `Payment: ${paymentLabel}`,
    `Status: ${order.order_status || "processing"}`,
    "",
    itemRows.text,
    "",
    `Delivery Address: ${address || "Saved with your order"}`,
  ].join("\n");

  return { subject, html, text };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as SendOrderEmailBody;
    if (!body.order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "canecreme2026";
    const authHeader = req.headers.get("authorization") || "";
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`;
    const isAdminCall = body.admin_password === expectedPassword;

    if (!isServiceCall && !isAdminCall) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const encodedId = encodeURIComponent(body.order_id);
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const [orderRes, itemsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}&limit=1`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodedId}&select=quantity,price,products(name,price)`, { headers }),
    ]);

    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);
    const orders = await orderRes.json() as OrderRow[];
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const items = itemsRes.ok ? await itemsRes.json() as OrderItemRow[] : [];
    const safeItems = Array.isArray(items) && items.length > 0 ? items : getItemSnapshot(order);
    const ownerEmail = Deno.env.get("RESEND_OWNER_EMAIL") || "canecreme@gmail.com";
    const customerEmail = String(order.customer_email || "").trim();
    const recipients = isRealCustomerEmail(customerEmail) ? [customerEmail] : [ownerEmail];
    const bcc = recipients.includes(ownerEmail) ? [] : [ownerEmail];
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "CaneCreme <orders@canecreme.co>";
    const email = buildEmail(order, safeItems, body.email_type || "order_confirmation");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        bcc,
        subject: email.subject,
        html: email.html,
        text: email.text,
        reply_to: ownerEmail,
      }),
    });

    const resendData = await resendRes.json().catch(async () => ({ raw: await resendRes.text() }));
    if (!resendRes.ok) {
      return jsonResponse({ error: "Resend email failed", details: resendData }, 502);
    }

    return jsonResponse({
      ok: true,
      email_id: resendData.id,
      to: recipients,
      bcc,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
