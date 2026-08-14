type AdminLeadsBody = {
  admin_password?: string;
  action?: "list";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as AdminLeadsBody;
    const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "canecreme2026";
    if (body.admin_password !== expectedPassword) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const action = body.action || "list";
    if (action !== "list") return jsonResponse({ error: "Unknown action" }, 400);

    let res = await fetch(
      `${supabaseUrl}/rest/v1/leads?select=*&source=eq.popup&order=created_at.desc`,
      { headers },
    );
    if (!res.ok) {
      res = await fetch(`${supabaseUrl}/rest/v1/leads?select=*&source=eq.popup`, { headers });
    }
    if (!res.ok) throw new Error(`Leads lookup failed: ${await res.text()}`);

    return jsonResponse({ leads: await res.json() });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
