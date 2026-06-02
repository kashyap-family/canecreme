type EstimateBody = {
  pin: string;
  delivery_type?: string;
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

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDisplayDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);

const parseDeliveryDays = (value: unknown) => {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const getValueByPossibleKeys = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
};

const flattenPickupLocations = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenPickupLocations(item));
  }
  if (!value || typeof value !== "object") return [];

  const obj = value as Record<string, unknown>;
  const nestedKeys = ["data", "shipping_address", "pickup_locations", "pickup_location", "locations"];
  const nested = nestedKeys.flatMap((key) => flattenPickupLocations(obj[key]));
  return nested.length ? nested : [obj];
};

const resolvePickupPostcode = async (token: string) => {
  const direct =
    Deno.env.get("SHIPROCKET_PICKUP_PINCODE") ||
    Deno.env.get("SHIPROCKET_PICKUP_POSTCODE") ||
    Deno.env.get("SHIPROCKET_PICKUP_PIN");

  if (direct) return direct;

  const pickupLocationName = Deno.env.get("SHIPROCKET_PICKUP_LOCATION") || "";
  const pickupRes = await fetch("https://apiv2.shiprocket.in/v1/external/settings/company/pickup", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const pickupData = await pickupRes.json();
  if (!pickupRes.ok) {
    throw new Error("Unable to fetch Shiprocket pickup locations.");
  }

  const locations = flattenPickupLocations(pickupData);
  const selected =
    locations.find((item) => {
      const name = getValueByPossibleKeys(item, ["pickup_location", "pickup_location_name", "name", "location_name", "nickname"]);
      return pickupLocationName && normalize(name) === normalize(pickupLocationName);
    }) ||
    locations[0];

  const postcode = selected
    ? getValueByPossibleKeys(selected, ["pin_code", "pincode", "postcode", "pickup_postcode", "zip", "zipcode"])
    : "";

  if (!postcode) {
    throw new Error("Shiprocket pickup pincode is not configured.");
  }
  return postcode;
};

const parseShiprocketDate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
    return parsed;
  }

  const match = raw.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!match) return null;

  const [, day, monthName, year] = match;
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(monthName.slice(0, 3).toLowerCase());
  if (monthIndex < 0) return null;

  return new Date(Number(year), monthIndex, Number(day));
};

const daysBetween = (from: Date, to: Date) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as EstimateBody;
    const pin = String(body.pin || "").replace(/\D/g, "");
    const deliveryType = body.delivery_type || "pan_india";

    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      return jsonResponse({ error: "Invalid Indian PIN code" }, 400);
    }
    if (deliveryType === "delhi_only" && !pin.startsWith("110")) {
      return jsonResponse({ error: "This product is delivered within Delhi only." }, 400);
    }

    const shiprocketEmail = requiredEnv("SHIPROCKET_EMAIL");
    const shiprocketPassword = requiredEnv("SHIPROCKET_PASSWORD");
    const authRes = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: shiprocketEmail,
        password: shiprocketPassword,
      }),
    });
    const authData = await authRes.json();
    if (!authRes.ok || !authData.token) {
      return jsonResponse({ error: "Shiprocket authentication failed", details: authData }, 502);
    }

    const pickupPostcode = await resolvePickupPostcode(authData.token);

    const serviceabilityUrl = new URL("https://apiv2.shiprocket.in/v1/external/courier/serviceability/");
    serviceabilityUrl.searchParams.set("pickup_postcode", pickupPostcode);
    serviceabilityUrl.searchParams.set("delivery_postcode", pin);
    serviceabilityUrl.searchParams.set("cod", "0");
    serviceabilityUrl.searchParams.set("weight", Deno.env.get("SHIPROCKET_PACKAGE_WEIGHT_KG") || "0.5");
    serviceabilityUrl.searchParams.set("length", Deno.env.get("SHIPROCKET_PACKAGE_LENGTH_CM") || "15");
    serviceabilityUrl.searchParams.set("breadth", Deno.env.get("SHIPROCKET_PACKAGE_BREADTH_CM") || "10");
    serviceabilityUrl.searchParams.set("height", Deno.env.get("SHIPROCKET_PACKAGE_HEIGHT_CM") || "5");

    const serviceabilityRes = await fetch(serviceabilityUrl.toString(), {
      headers: {
        Authorization: `Bearer ${authData.token}`,
        "Content-Type": "application/json",
      },
    });
    const serviceabilityData = await serviceabilityRes.json();
    if (!serviceabilityRes.ok) {
      return jsonResponse({ error: "Shiprocket serviceability check failed", details: serviceabilityData }, 502);
    }

    const couriers = serviceabilityData?.data?.available_courier_companies || [];
    if (!Array.isArray(couriers) || couriers.length === 0) {
      return jsonResponse({ available: false, pin, message: "No courier service found for this PIN code." });
    }

    const courier = couriers.find((item) => item?.etd || item?.estimated_delivery_days) || couriers[0];
    const etaDateFromShiprocket = parseShiprocketDate(courier?.etd);
    const fallbackDays =
      parseDeliveryDays(courier?.estimated_delivery_days) ||
      parseDeliveryDays(courier?.etd) ||
      parseDeliveryDays(courier?.estimated_delivery_time) ||
      5;
    const estimatedDate = etaDateFromShiprocket || addDays(new Date(), fallbackDays);

    return jsonResponse({
      available: true,
      pin,
      courier: courier?.courier_name || courier?.name || "Shiprocket",
      estimated_days: etaDateFromShiprocket ? daysBetween(new Date(), etaDateFromShiprocket) : fallbackDays,
      estimated_date: formatDisplayDate(estimatedDate),
      raw_etd: courier?.etd || "",
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
