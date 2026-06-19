type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pin?: string;
    country?: string;
    delivery_charge?: number;
  };
  total_amount: number;
  payment_status: string;
  payment_id?: string | null;
};

type OrderItem = {
  quantity: number;
  price: number;
  products?: {
    name?: string;
  };
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

const optionalNumberEnv = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const getPackageWeightGrams = () => {
  const grams = Number(Deno.env.get("RAPIDSHYP_PACKAGE_WEIGHT_GM"));
  if (Number.isFinite(grams) && grams > 0) return grams;

  const kilograms = Number(Deno.env.get("RAPIDSHYP_PACKAGE_WEIGHT_KG"));
  if (Number.isFinite(kilograms) && kilograms > 0) return Math.round(kilograms * 1000);

  return 500;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getRapidShypEndpoint = () => {
  const configured = Deno.env.get("RAPIDSHYP_CREATE_ORDER_URL")?.trim();
  if (configured) return configured;

  return "https://api.rapidshyp.com/rapidshyp/apis/v1/create_order";
};

const splitName = (name: string) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "CaneCreme";
  return {
    firstName,
    lastName: parts.join(" "),
  };
};

const cleanSkuPart = (value: string) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "ITEM";

const parseRapidShypResponse = (text: string) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

const optionalEnv = (name: string, fallback: string) =>
  Deno.env.get(name)?.trim() || fallback;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const rapidshypToken = requiredEnv("RAPIDSHYP_API_TOKEN");
    const rapidshypEndpoint = getRapidShypEndpoint();

    const dbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const encodedId = encodeURIComponent(order_id);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedId}&limit=1`, {
      headers: dbHeaders,
    });
    if (!orderRes.ok) throw new Error(`Order lookup failed: ${await orderRes.text()}`);

    const orders = await orderRes.json() as Order[];
    const order = orders[0];
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const isCodOrder = order.payment_status === "cod";
    if (order.payment_status !== "paid" && !isCodOrder) {
      return jsonResponse({ error: "Order is not ready for shipping yet" }, 409);
    }

    const itemsRes = await fetch(
      `${supabaseUrl}/rest/v1/order_items?order_id=eq.${encodedId}&select=quantity,price,products(name)`,
      { headers: dbHeaders },
    );
    if (!itemsRes.ok) throw new Error(`Order items lookup failed: ${await itemsRes.text()}`);
    const items = await itemsRes.json() as OrderItem[];

    const addr = order.shipping_address || {};
    const deliveryCharge = Number(addr.delivery_charge || 0);
    const shortId = String(order.id).slice(0, 8).toUpperCase();
    const today = new Date();
    const customerName = splitName(order.customer_name);
    const packageLength = optionalNumberEnv("RAPIDSHYP_PACKAGE_LENGTH_CM", 12);
    const packageBreadth = optionalNumberEnv("RAPIDSHYP_PACKAGE_BREADTH_CM", 12);
    const packageHeight = optionalNumberEnv("RAPIDSHYP_PACKAGE_HEIGHT_CM", 8);
    const packageWeightGrams = getPackageWeightGrams();
    const pickupAddressName = Deno.env.get("RAPIDSHYP_PICKUP_LOCATION")?.trim() || "CaneCreme";
    const storeName = Deno.env.get("RAPIDSHYP_STORE_NAME")?.trim() || "DEFAULT";

    const payload = {
      orderId: order.id,
      orderDate: formatDate(today),
      pickupLocation: {
        contactName: optionalEnv("RAPIDSHYP_PICKUP_CONTACT_NAME", "Kshitiz"),
        pickupName: pickupAddressName,
        pickupEmail: optionalEnv("RAPIDSHYP_PICKUP_EMAIL", "canecreme@gmail.com"),
        pickupPhone: optionalEnv("RAPIDSHYP_PICKUP_PHONE", "7428906045"),
        pickupAddress1: optionalEnv("RAPIDSHYP_PICKUP_ADDRESS1", "69/6A najafgarh area, rama road"),
        pickupAddress2: optionalEnv("RAPIDSHYP_PICKUP_ADDRESS2", "moti nagar, west delhi"),
        pinCode: optionalEnv("RAPIDSHYP_PICKUP_PIN", "110015"),
      },
      storeName,
      billingIsShipping: true,
      shippingAddress: {
        firstName: customerName.firstName,
        lastName: customerName.lastName,
        addressLine1: addr.line1 || "",
        addressLine2: addr.line2 || "",
        pinCode: addr.pin || "",
        email: order.customer_email || "",
        phone: order.customer_phone,
      },
      billingAddress: {
        firstName: customerName.firstName,
        lastName: customerName.lastName,
        addressLine1: addr.line1 || "",
        addressLine2: addr.line2 || "",
        pinCode: addr.pin || "",
        email: order.customer_email || "",
        phone: order.customer_phone,
      },
      orderItems: items.map((item, index) => {
        const itemName = item.products?.name || `CaneCreme Item ${index + 1}`;
        return {
          itemName,
          sku: `CC-${shortId}-${cleanSkuPart(itemName)}-${index + 1}`.slice(0, 200),
          description: itemName,
          units: Number(item.quantity || 0),
          unitPrice: Number(item.price || 0),
          tax: 0,
          productLength: packageLength,
          productBreadth: packageBreadth,
          productHeight: packageHeight,
          productWeight: packageWeightGrams,
          brand: "CaneCreme",
          isFragile: false,
          isPersonalisable: false,
        };
      }),
      paymentMethod: isCodOrder ? "COD" : "PREPAID",
      shippingCharges: deliveryCharge,
      giftWrapCharges: 0,
      transactionCharges: 0,
      totalDiscount: 0,
      codCharges: 0,
      prepaidAmount: isCodOrder ? 0 : Number(order.total_amount || 0),
      packageDetails: {
        packageLength,
        packageBreadth,
        packageHeight,
        packageWeight: packageWeightGrams,
      },
    };

    if (items.length === 0 || payload.orderItems.some((item) => item.units <= 0 || item.unitPrice <= 0)) {
      return jsonResponse({ error: "Order has invalid or empty items" }, 409);
    }

    const createRes = await fetch(rapidshypEndpoint, {
      method: "POST",
      headers: {
        "rapidshyp-token": rapidshypToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const createText = await createRes.text();
    const createData = parseRapidShypResponse(createText);

    if (!createRes.ok) {
      return jsonResponse({ error: "RapidShyp order creation failed", details: createData }, 502);
    }

    const status = typeof createData === "object" && createData !== null && "status" in createData
      ? String((createData as { status?: unknown }).status || "").toLowerCase()
      : "";
    if (status && status !== "success") {
      return jsonResponse({ error: "RapidShyp rejected the order", details: createData }, 502);
    }

    return jsonResponse({
      ok: true,
      rapidshyp: createData,
      rapidshyp_order_id: typeof createData === "object" && createData !== null
        ? (createData as { order_id?: unknown }).order_id || null
        : null,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
