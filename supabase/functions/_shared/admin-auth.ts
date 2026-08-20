export type AdminRole = "owner" | "super_admin" | "admin" | "manager" | "support" | "marketing";
export type AdminStatus = "active" | "invited" | "suspended" | "disabled";
export type AdminPermissionAction = "view" | "create" | "edit" | "delete" | "export" | "manage";
export type AdminPermissionModule =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "reports"
  | "settings"
  | "security"
  | "backups"
  | "users";

type AdminSessionPayload = {
  sub: string;
  sid?: string;
  role: AdminRole | "admin";
  iat: number;
  exp: number;
};

export type AdminAuthBody = {
  admin_password?: string;
  admin_session?: string;
};

export type AdminContext = {
  user: AdminUserRecord;
  sessionId?: string;
  legacy: boolean;
};

export type AdminUserRecord = {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: AdminRole;
  status: AdminStatus;
  two_factor_required?: boolean;
  two_factor_enabled?: boolean;
  failed_login_count?: number;
  last_failed_login_at?: string | null;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const HIGH_PRIVILEGE_ROLES = new Set<AdminRole>(["owner", "super_admin", "admin"]);

const base64UrlEncode = (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
};

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const randomToken = (bytes = 32) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return base64UrlEncode(values);
};

export const timingSafeEqual = (a: string, b: string) => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};

const getAdminSecret = () =>
  Deno.env.get("ADMIN_SESSION_SECRET") ||
  Deno.env.get("ADMIN_PASSWORD") ||
  "canecreme2026";

export const isAdminPasswordValid = (password?: string) => {
  const expected = Deno.env.get("ADMIN_PASSWORD") || "canecreme2026";
  return Boolean(password) && timingSafeEqual(String(password), expected);
};

const sign = async (data: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAdminSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export const getServiceHeaders = () => {
  const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
};

export const dbFetch = async (path: string, init: RequestInit = {}) => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const headers = getServiceHeaders();
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} failed: ${await res.text()}`);
  return res;
};

export const dbJson = async <T>(path: string, init: RequestInit = {}) => {
  const res = await dbFetch(path, init);
  return await res.json() as T;
};

export const getOwnerUser = async () => {
  const ownerEmail = Deno.env.get("ADMIN_OWNER_EMAIL") || "canecreme@gmail.com";
  const rows = await dbJson<AdminUserRecord[]>(
    `admin_users?email=eq.${encodeURIComponent(ownerEmail)}&deleted_at=is.null&limit=1`,
  );
  return rows[0] || null;
};

export const createAdminSession = async (user?: AdminUserRecord, req?: Request) => {
  const now = Math.floor(Date.now() / 1000);
  const adminUser = user || await getOwnerUser();
  if (!adminUser) throw new Error("Owner admin user is not configured");
  if (adminUser.status !== "active" || adminUser.deleted_at) throw new Error("Admin user is not active");

  const sessionSecret = randomToken(32);
  const sessionHash = await sha256Hex(sessionSecret);
  const expiresAt = new Date((now + SESSION_TTL_SECONDS) * 1000).toISOString();
  const sessionRows = await dbJson<Array<{ id: string }>>("admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: adminUser.id,
      session_hash: sessionHash,
      ip_address: req?.headers.get("x-forwarded-for") || null,
      user_agent: req?.headers.get("user-agent") || null,
      expires_at: expiresAt,
    }),
  });
  const sessionId = sessionRows[0]?.id;
  if (!sessionId) throw new Error("Admin session could not be created");

  await dbFetch(`admin_users?id=eq.${encodeURIComponent(adminUser.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_login_at: new Date().toISOString(), failed_login_count: 0, updated_at: new Date().toISOString() }),
  });

  const payload: AdminSessionPayload = {
    sub: adminUser.id,
    sid: sessionId,
    role: adminUser.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${await sign(encodedPayload)}.${sessionSecret}`;
};

export const parseAdminSession = async (token?: string) => {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature, sessionSecret] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = await sign(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AdminSessionPayload>;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { payload, sessionSecret };
  } catch {
    return null;
  }
};

export const verifyAdminSession = async (token?: string): Promise<AdminContext | false> => {
  const parsed = await parseAdminSession(token);
  if (!parsed) return false;
  const { payload, sessionSecret } = parsed;

  if (!payload.sid || !sessionSecret) {
    return payload.sub === "canecreme-admin" && payload.role === "admin"
      ? { user: await getLegacyOwnerContext(), legacy: true }
      : false;
  }

  const sessionHash = await sha256Hex(sessionSecret);
  const sessions = await dbJson<Array<{
    id: string;
    user_id: string;
    session_hash: string;
    expires_at: string;
    revoked_at: string | null;
    admin_users: AdminUserRecord | null;
  }>>(
    `admin_sessions?id=eq.${encodeURIComponent(payload.sid)}&session_hash=eq.${encodeURIComponent(sessionHash)}&select=*,admin_users(*)&limit=1`,
  );
  const session = sessions[0];
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return false;
  const user = session.admin_users;
  if (!user || user.status !== "active" || user.deleted_at) return false;

  await dbFetch(`admin_sessions?id=eq.${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });

  return { user, sessionId: session.id, legacy: false };
};

const getLegacyOwnerContext = async (): Promise<AdminUserRecord> => {
  const owner = await getOwnerUser();
  if (owner && owner.status === "active" && !owner.deleted_at) return owner;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "canecreme@gmail.com",
    full_name: "CaneCreme Owner",
    role: "owner",
    status: "active",
  };
};

export const getAdminContext = async (body: AdminAuthBody): Promise<AdminContext | false> => {
  const sessionContext = await verifyAdminSession(body.admin_session);
  if (sessionContext) return sessionContext;
  if (!isAdminPasswordValid(body.admin_password)) return false;
  const owner = await getOwnerUser();
  if (!owner || owner.status !== "active" || owner.deleted_at) return false;
  return { user: owner, legacy: false };
};

export const isAdminRequest = async (body: AdminAuthBody) => Boolean(await getAdminContext(body));

export const hasPermission = async (
  user: AdminUserRecord,
  module: AdminPermissionModule,
  action: AdminPermissionAction,
) => {
  if (user.role === "owner") return true;
  const overrides = await dbJson<Array<{ allowed: boolean }>>(
    `admin_user_permission_overrides?user_id=eq.${encodeURIComponent(user.id)}&module=eq.${module}&action=eq.${action}&limit=1`,
  );
  if (overrides.length) return Boolean(overrides[0].allowed);
  const rows = await dbJson<Array<{ allowed: boolean }>>(
    `admin_role_permissions?role=eq.${user.role}&module=eq.${module}&action=eq.${action}&allowed=eq.true&limit=1`,
  );
  return Boolean(rows.length);
};

export const requirePermission = async (
  body: AdminAuthBody,
  module: AdminPermissionModule,
  action: AdminPermissionAction,
) => {
  const context = await getAdminContext(body);
  if (!context) throw new Error("Unauthorized");
  if (!await hasPermission(context.user, module, action)) throw new Error("Forbidden");
  return context;
};

export const roleRequiresTwoFactor = (role: AdminRole) => HIGH_PRIVILEGE_ROLES.has(role);
