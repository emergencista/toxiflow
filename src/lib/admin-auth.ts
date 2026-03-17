import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE_NAME = "toxiflow_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

type AdminAuthConfig = {
  username: string;
  password: string;
  sessionSecret: string;
};

function getAdminAuthConfig(): AdminAuthConfig | null {
  const username = process.env.TOXIFLOW_ADMIN_USERNAME;
  const password = process.env.TOXIFLOW_ADMIN_PASSWORD;
  const sessionSecret = process.env.TOXIFLOW_ADMIN_SESSION_SECRET;

  if (!username || !password || !sessionSecret) {
    return null;
  }

  return { username, password, sessionSecret };
}

export function isAdminAuthConfigured(): boolean {
  return getAdminAuthConfig() != null;
}

export function validateAdminCredentials(username: string, password: string): boolean {
  const config = getAdminAuthConfig();
  if (!config) {
    return false;
  }

  return safeEqual(username, config.username) && safeEqual(password, config.password);
}

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
};

function signPayload(payloadBase64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("hex");
}

export function createAdminSessionToken(): string | null {
  const config = getAdminAuthConfig();
  if (!config) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: config.username,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
    nonce: randomBytes(12).toString("hex")
  };

  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64, config.sessionSecret);
  return `${payloadBase64}.${signature}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const config = getAdminAuthConfig();
  if (!config) {
    return null;
  }

  const expectedSignature = signPayload(payloadBase64, config.sessionSecret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadBase64)) as SessionPayload;
    if (!payload?.sub || !payload?.exp || !payload?.iat || !payload?.nonce) {
      return null;
    }

    if (!safeEqual(payload.sub, config.username)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getAdminSessionPayload(value: string | null | undefined): SessionPayload | null {
  if (!value) {
    return null;
  }

  return parseSessionToken(value);
}

export function isAdminSessionValue(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return parseSessionToken(value) != null;
}

function normalizeIp(value: string): string {
  return value.replace(/^\[(.*)\]$/, "$1").trim();
}

function getClientIpFromRequest(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
  return normalizeIp(ip);
}

export function isAdminIpAllowed(request: Request): boolean {
  const allowlistRaw = process.env.TOXIFLOW_ADMIN_IP_ALLOWLIST;
  if (!allowlistRaw || !allowlistRaw.trim()) {
    return true;
  }

  const allowed = allowlistRaw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);

  if (!allowed.length) {
    return true;
  }

  const currentIp = getClientIpFromRequest(request);
  return allowed.includes(currentIp);
}

export function isAdminIpAllowedByValue(ip: string): boolean {
  const allowlistRaw = process.env.TOXIFLOW_ADMIN_IP_ALLOWLIST;
  if (!allowlistRaw || !allowlistRaw.trim()) {
    return true;
  }

  const allowed = allowlistRaw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);

  if (!allowed.length) {
    return true;
  }

  return allowed.includes(normalizeIp(ip));
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce<Record<string, string>>((accumulator, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }

    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

export function isAuthorizedAdminRequest(request: Request): boolean {
  if (!isAdminAuthConfigured()) {
    return false;
  }

  if (!isAdminIpAllowed(request)) {
    return false;
  }

  const configuredToken = process.env.TOXIFLOW_ADMIN_TOKEN;
  const header = request.headers.get("authorization");
  if (configuredToken && header === `Bearer ${configuredToken}`) {
    return true;
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return isAdminSessionValue(cookies[ADMIN_SESSION_COOKIE_NAME]);
}

export function getAdminIdentityFromRequest(request: Request): string {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const payload = getAdminSessionPayload(cookies[ADMIN_SESSION_COOKIE_NAME]);
  if (payload?.sub) {
    return payload.sub;
  }

  const configuredToken = process.env.TOXIFLOW_ADMIN_TOKEN;
  const header = request.headers.get("authorization");
  if (configuredToken && header === `Bearer ${configuredToken}`) {
    return "token-admin";
  }

  return "unknown";
}

export function getRequestClientIp(request: Request): string {
  return getClientIpFromRequest(request);
}
