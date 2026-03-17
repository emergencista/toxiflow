#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const OFFSET_FILE_PATH = "/home/ubuntu/toxiflow/.state/telegram-offset.json";
const NGINX_LOG_FILES = ["/var/log/nginx/access.log", "/var/log/nginx/access.log.1"];

const MONTHS = {
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

function ensureStateDirectory() {
  fs.mkdirSync(path.dirname(OFFSET_FILE_PATH), { recursive: true });
}

function readOffset() {
  try {
    const content = fs.readFileSync(OFFSET_FILE_PATH, "utf8");
    const parsed = JSON.parse(content);
    return Number.isInteger(parsed.offset) ? parsed.offset : null;
  } catch {
    return null;
  }
}

function writeOffset(offset) {
  ensureStateDirectory();
  fs.writeFileSync(OFFSET_FILE_PATH, JSON.stringify({ offset }), "utf8");
}

function parseCommand(text) {
  const normalized = text.trim();
  if (!normalized.startsWith("/")) {
    return null;
  }

  const [commandWithBot] = normalized.split(/\s+/);
  const command = commandWithBot.split("@")[0];
  return command;
}

function parseNginxDate(value) {
  const match = value.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2]];
  const year = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6], 10);
  const tz = match[7];

  if (month === undefined) {
    return null;
  }

  const isoLike = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${tz.slice(0, 3)}:${tz.slice(3)}`;
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getExcludedIps() {
  const raw = process.env.TOXIFLOW_ACCESS_EXCLUDED_IPS || process.env.TOXIFLOW_ADMIN_IP_ALLOWLIST || "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function isPublicPath(pathname) {
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

function shouldIgnoreUserAgent(userAgent) {
  const value = userAgent.toLowerCase();
  return value.includes("curl") || value.includes("bot") || value.includes("scan");
}

function collectAccessStats(now) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let accessesToday = 0;
  let accessesLast24h = 0;
  const uniqueIpsLast24h = new Set();
  const excludedIps = getExcludedIps();

  for (const filePath of NGINX_LOG_FILES) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

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

function buildAccessMessage() {
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

async function sendTelegramMessage({ token, chatId, text }) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar mensagem Telegram: ${body}`);
  }
}

async function handleUpdate({ update, token, configuredChatId }) {
  const message = update.message || update.edited_message;
  if (!message || typeof message.text !== "string") {
    return;
  }

  const chatId = String(message.chat?.id || "");
  if (chatId !== String(configuredChatId)) {
    return;
  }

  const command = parseCommand(message.text);
  if (!command) {
    return;
  }

  if (command === "/acesso") {
    await sendTelegramMessage({
      token,
      chatId,
      text: buildAccessMessage(),
    });
    return;
  }

  await sendTelegramMessage({
    token,
    chatId,
    text: "Comando nao reconhecido. Use /acesso.",
  });
}

async function main() {
  const token = process.env.TOXIFLOW_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TOXIFLOW_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TOXIFLOW_TELEGRAM_BOT_TOKEN e TOXIFLOW_TELEGRAM_CHAT_ID sao obrigatorios.");
  }

  const offset = readOffset();
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  if (offset !== null) {
    url.searchParams.set("offset", String(offset + 1));
  }
  url.searchParams.set("timeout", "0");
  url.searchParams.set("limit", "50");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao consultar updates do Telegram: ${body}`);
  }

  const payload = await response.json();
  const updates = Array.isArray(payload.result) ? payload.result : [];
  if (updates.length === 0) {
    return;
  }

  let lastOffset = offset;
  for (const update of updates) {
    await handleUpdate({ update, token, configuredChatId: chatId });
    lastOffset = update.update_id;
  }

  if (Number.isInteger(lastOffset)) {
    writeOffset(lastOffset);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha no poller Telegram.");
  process.exit(1);
});
