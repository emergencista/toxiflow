import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionToken,
  getRequestClientIp,
  isAdminAuthConfigured,
  isAdminIpAllowed,
  validateAdminCredentials,
} from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/admin-audit";
import { isTelegram2faConfigured, sendTelegramMessage } from "@/lib/telegram";

const MAX_ATTEMPTS = 7;
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

type AttemptState = {
  fails: number;
  firstFailAt: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, AttemptState>();

type OtpState = {
  username: string;
  code: string;
  expiresAt: number;
  attempts: number;
};

const otpChallenges = new Map<string, OtpState>();

function getCookiePath() {
  return process.env.TOXIFLOW_BASE_PATH || "/";
}

function getClientIdentifier(request: Request): string {
  return getRequestClientIp(request);
}

function shouldRequireAdmin2fa(): boolean {
  const raw = process.env.TOXIFLOW_ADMIN_REQUIRE_2FA;
  if (raw?.trim()) {
    return raw.toLowerCase() !== "false";
  }

  return isTelegram2faConfigured();
}

function createOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getAttemptState(key: string): AttemptState {
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current) {
    const initial = { fails: 0, firstFailAt: now, blockedUntil: 0 };
    loginAttempts.set(key, initial);
    return initial;
  }

  if (current.blockedUntil > 0 && current.blockedUntil <= now) {
    const reset = { fails: 0, firstFailAt: now, blockedUntil: 0 };
    loginAttempts.set(key, reset);
    return reset;
  }

  if (current.fails > 0 && now - current.firstFailAt > WINDOW_MS) {
    const reset = { fails: 0, firstFailAt: now, blockedUntil: 0 };
    loginAttempts.set(key, reset);
    return reset;
  }

  return current;
}

function markFailure(key: string) {
  const now = Date.now();
  const current = getAttemptState(key);
  const nextFails = current.fails + 1;
  const blockedUntil = nextFails >= MAX_ATTEMPTS ? now + BLOCK_MS : 0;

  loginAttempts.set(key, {
    fails: nextFails,
    firstFailAt: current.fails > 0 ? current.firstFailAt : now,
    blockedUntil
  });

  return blockedUntil;
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      { error: "Admin não configurado. Defina TOXIFLOW_ADMIN_USERNAME, TOXIFLOW_ADMIN_PASSWORD e TOXIFLOW_ADMIN_SESSION_SECRET." },
      { status: 503 }
    );
  }

  if (!isAdminIpAllowed(request)) {
    return NextResponse.json({ error: "Acesso administrativo bloqueado para este IP." }, { status: 403 });
  }

  const clientKey = getClientIdentifier(request);
  const clientIp = clientKey;
  const userAgent = request.headers.get("user-agent") || "unknown";
  const state = getAttemptState(clientKey);
  const now = Date.now();

  if (state.blockedUntil > now) {
    await recordAdminAudit({
      action: "login_rate_limited",
      actor: "unknown",
      success: false,
      ip: clientIp,
      userAgent,
    });
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!validateAdminCredentials(username, password)) {
      markFailure(clientKey);
      await recordAdminAudit({
        action: "login_failed",
        actor: username || "unknown",
        success: false,
        ip: clientIp,
        userAgent,
      });
      return NextResponse.json({ error: "Login ou senha inválidos." }, { status: 401 });
    }

    clearAttempts(clientKey);

    if (shouldRequireAdmin2fa()) {
      if (!isTelegram2faConfigured()) {
        await recordAdminAudit({
          action: "login_2fa_unavailable",
          actor: username,
          success: false,
          ip: clientIp,
          userAgent,
        });
        return NextResponse.json(
          {
            error:
              "2FA obrigatório, mas Telegram não está configurado. Defina TOXIFLOW_TELEGRAM_BOT_TOKEN e TOXIFLOW_TELEGRAM_CHAT_ID.",
          },
          { status: 503 }
        );
      }

      const code = createOtpCode();
      otpChallenges.set(clientKey, {
        username,
        code,
        attempts: 0,
        expiresAt: Date.now() + OTP_TTL_MS,
      });

      const sendResult = await sendTelegramMessage(
        `ToxiFlow admin OTP: ${code}\nIP: ${clientIp}\nValidade: 5 minutos.`
      );

      if (!sendResult.ok) {
        otpChallenges.delete(clientKey);
        await recordAdminAudit({
          action: "login_2fa_dispatch_failed",
          actor: username,
          success: false,
          ip: clientIp,
          userAgent,
          details: { reason: sendResult.error || "unknown" },
        });
        return NextResponse.json({ error: "Falha ao enviar código 2FA no Telegram." }, { status: 502 });
      }

      await recordAdminAudit({
        action: "login_password_ok_awaiting_otp",
        actor: username,
        success: true,
        ip: clientIp,
        userAgent,
      });

      return NextResponse.json({ ok: true, requiresOtp: true });
    }

    const sessionToken = createAdminSessionToken();
    if (!sessionToken) {
      return NextResponse.json({ error: "Falha ao gerar sessão administrativa." }, { status: 500 });
    }

    await recordAdminAudit({
      action: "login_success",
      actor: username,
      success: true,
      ip: clientIp,
      userAgent,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: getCookiePath(),
      maxAge: 60 * 60 * 8
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Falha ao iniciar sessão." }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: getCookiePath(),
    maxAge: 0
  });

  return response;
}

export async function PUT(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      { error: "Admin não configurado. Defina TOXIFLOW_ADMIN_USERNAME, TOXIFLOW_ADMIN_PASSWORD e TOXIFLOW_ADMIN_SESSION_SECRET." },
      { status: 503 }
    );
  }

  if (!isAdminIpAllowed(request)) {
    return NextResponse.json({ error: "Acesso administrativo bloqueado para este IP." }, { status: 403 });
  }

  const clientKey = getClientIdentifier(request);
  const clientIp = clientKey;
  const userAgent = request.headers.get("user-agent") || "unknown";

  const otpState = otpChallenges.get(clientKey);
  if (!otpState) {
    return NextResponse.json({ error: "Nenhum desafio 2FA ativo para este cliente." }, { status: 400 });
  }

  if (Date.now() > otpState.expiresAt) {
    otpChallenges.delete(clientKey);
    await recordAdminAudit({
      action: "login_otp_expired",
      actor: otpState.username,
      success: false,
      ip: clientIp,
      userAgent,
    });
    return NextResponse.json({ error: "Código 2FA expirado. Faça login novamente." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim() ?? "";

    if (!code || code !== otpState.code) {
      otpState.attempts += 1;
      otpChallenges.set(clientKey, otpState);

      if (otpState.attempts >= OTP_MAX_ATTEMPTS) {
        otpChallenges.delete(clientKey);
      }

      await recordAdminAudit({
        action: "login_otp_failed",
        actor: otpState.username,
        success: false,
        ip: clientIp,
        userAgent,
      });
      return NextResponse.json({ error: "Código 2FA inválido." }, { status: 401 });
    }

    otpChallenges.delete(clientKey);
    const sessionToken = createAdminSessionToken();
    if (!sessionToken) {
      return NextResponse.json({ error: "Falha ao gerar sessão administrativa." }, { status: 500 });
    }

    await recordAdminAudit({
      action: "login_success",
      actor: otpState.username,
      success: true,
      ip: clientIp,
      userAgent,
      details: { with2fa: true },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: getCookiePath(),
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Falha ao validar código 2FA." }, { status: 400 });
  }
}
