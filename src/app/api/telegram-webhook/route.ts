import { NextResponse } from "next/server";
import Parser from "rss-parser";

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
