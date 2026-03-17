import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { readFileSync, existsSync } from "node:fs";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
  edited_message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

const FEEDS = [
  "https://coreem.net/feed/",
  "https://pharmertoxguy.com/feed/",
  "https://canadiem.org/feed/",
  "https://rebelem.com/feed/",
  "https://emergencymedicinecases.com/feed/",
  "https://emcrit.org/feed/",
  "https://www.emdocs.net/feed/",
  "https://www.thebottomline.org.uk/feed/",
];

const NGINX_LOG_FILES = ["/var/log/nginx/access.log", "/var/log/nginx/access.log.1"];

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeCommand(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("/")) {
    return "";
  }

  const [commandWithBot] = normalized.split(/\s+/);
  return commandWithBot.split("@")[0] || "";
}

function parseNginxDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!match) {
    return null;
  }

  const month = MONTHS[match[2]];
  if (month === undefined) {
    return null;
  }

  const year = Number.parseInt(match[3], 10);
  const day = Number.parseInt(match[1], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6], 10);
  const tz = match[7];
  const isoLike = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${tz.slice(0, 3)}:${tz.slice(3)}`;
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPublicPath(pathname: string): boolean {
  if (!pathname.startsWith("/toxiflow")) {
    return false;
  }

  if (
    pathname.startsWith("/toxiflow/admin") ||
    pathname.startsWith("/toxiflow/api") ||
    pathname.startsWith("/toxiflow/_next") ||
    pathname.startsWith("/toxiflow/favicon") ||
    pathname.startsWith("/toxiflow/manifest")
  ) {
    return false;
  }

  if (pathname.match(/\.[a-zA-Z0-9]+$/)) {
    return false;
  }

  return true;
}

function shouldIgnoreUserAgent(userAgent: string): boolean {
  const value = userAgent.toLowerCase();
  return value.includes("curl") || value.includes("bot") || value.includes("scan");
}

function getExcludedIps(): Set<string> {
  const raw = process.env.TOXIFLOW_ACCESS_EXCLUDED_IPS || process.env.TOXIFLOW_ADMIN_IP_ALLOWLIST || "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function collectAccessStats(now: Date): { accessesToday: number; accessesLast24h: number; uniquePlaces: number } {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let accessesToday = 0;
  let accessesLast24h = 0;
  const uniqueIpsLast24h = new Set<string>();
  const excludedIps = getExcludedIps();

  for (const filePath of NGINX_LOG_FILES) {
    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      if (!line) {
        continue;
      }

      const match = line.match(
        /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^\s]+)\s+HTTP\/[0-9.]+"\s+(\d{3})\s+\S+\s+"[^"]*"\s+"([^"]*)"/
      );

      if (!match) {
        continue;
      }

      const ip = match[1];
      const method = match[3] || "";
      const requestPath = (match[4] || "").split("?")[0];
      const status = Number.parseInt(match[5], 10);
      const userAgent = match[6] || "";

      if (!["GET", "HEAD"].includes(method)) {
        continue;
      }

      if (!Number.isFinite(status) || status < 200 || status >= 400) {
        continue;
      }

      if (excludedIps.has(ip)) {
        continue;
      }

      if (shouldIgnoreUserAgent(userAgent)) {
        continue;
      }

      if (!isPublicPath(requestPath)) {
        continue;
      }

      const timestamp = parseNginxDate(match[2]);
      if (!timestamp) {
        continue;
      }

      if (timestamp >= startOfToday && timestamp <= now) {
        accessesToday += 1;
      }

      if (timestamp >= last24hStart && timestamp <= now) {
        accessesLast24h += 1;
        uniqueIpsLast24h.add(ip);
      }
    }
  }

  return {
    accessesToday,
    accessesLast24h,
    uniquePlaces: uniqueIpsLast24h.size,
  };
}

function buildAccessMessage(): string {
  const now = new Date();
  const stats = collectAccessStats(now);

  return [
    "Acessos ToxiFlow",
    `Desde hoje (00:00): ${stats.accessesToday}`,
    `Ultimas 24h: ${stats.accessesLast24h}`,
    `Lugares diferentes (IPs unicos, ultimas 24h): ${stats.uniquePlaces}`,
    `Atualizado em: ${now.toISOString()}`,
  ].join("\n");
}

function buildNewsMessage(rows: Array<{ url: string }>): string {
  if (!rows.length) {
    return [
      "<b>TOX Radar</b>",
      "",
      "Nenhuma atualizacao foi encontrada no banco ate o momento.",
      "Tente novamente mais tarde.",
    ].join("\n");
  }

  const lines = rows.map((row, index) => {
    const safeUrl = escapeHtml(row.url);
    return `${index + 1}. <a href=\"${safeUrl}\">${safeUrl}</a>`;
  });

  return [
    "<b>TOX Radar | Ultimas Atualizacoes</b>",
    "",
    ...lines,
    "",
    "Fonte: registros mais recentes de tox_alerts_sent",
  ].join("\n");
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar mensagem Telegram: HTTP ${response.status} - ${body}`);
  }
}

async function getLatestNewsRows() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin nao configurado no servidor.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tox_alerts_sent")
    .select("url, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`Erro ao consultar tox_alerts_sent: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function getLatestNewsRowsFromFeeds(): Promise<Array<{ url: string; created_at: string }>> {
  const parser = new Parser();
  const allItems: Array<{ url: string; created_at: string }> = [];

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = Array.isArray(feed.items) ? feed.items : [];

      for (const item of items.slice(0, 4)) {
        const url = String(item.link || "").trim();
        if (!url) {
          continue;
        }

        const rawDate = item.isoDate || item.pubDate || new Date().toISOString();
        const date = new Date(rawDate);
        const createdAt = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
        allItems.push({ url, created_at: createdAt });
      }
    } catch {
      // Ignore individual feed failures to keep /news resilient.
    }
  }

  const dedup = new Map<string, { url: string; created_at: string }>();
  for (const row of allItems) {
    if (!dedup.has(row.url)) {
      dedup.set(row.url, row);
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);
}

export async function POST(request: Request) {
  const token = process.env.TOXIFLOW_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const configuredChatId = String(process.env.TOXIFLOW_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "").trim();

  if (!token || !configuredChatId) {
    return NextResponse.json({ ok: false, error: "Telegram nao configurado." }, { status: 503 });
  }

  let payload: TelegramUpdate = {};
  try {
    payload = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = payload.message || payload.edited_message;
  const text = String(message?.text || "").trim();
  const chatId = String(message?.chat?.id || "").trim();

  if (!text || !chatId || chatId !== configuredChatId) {
    return NextResponse.json({ ok: true });
  }

  const command = normalizeCommand(text);
  if (command === "/acesso") {
    try {
      await sendTelegramMessage(token, chatId, buildAccessMessage());
    } catch (error) {
      console.error("[telegram-webhook] /acesso error:", error instanceof Error ? error.message : "unknown");
      await sendTelegramMessage(token, chatId, "Falha ao consultar acessos no momento. Tente novamente em alguns minutos.");
    }
    return NextResponse.json({ ok: true });
  }

  if (command !== "/news") {
    return NextResponse.json({ ok: true });
  }

  try {
    const rows = await getLatestNewsRows();
    await sendTelegramMessage(token, chatId, buildNewsMessage(rows));
  } catch (error) {
    console.error("[telegram-webhook] /news error:", error instanceof Error ? error.message : "unknown");

    try {
      const fallbackRows = await getLatestNewsRowsFromFeeds();
      await sendTelegramMessage(token, chatId, buildNewsMessage(fallbackRows));
    } catch {
      await sendTelegramMessage(
        token,
        chatId,
        [
          "<b>TOX Radar</b>",
          "",
          "Nao foi possivel consultar as atualizacoes agora.",
          "Tente novamente em alguns minutos.",
        ].join("\n")
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "telegram webhook ativo" });
}
