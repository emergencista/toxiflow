require("dotenv").config();

const Parser = require("rss-parser");
const { createClient } = require("@supabase/supabase-js");

const FEEDS = [
  "https://coreem.net/feed/",
  "https://pharmertoxguy.com/feed/",
  "https://canadiem.org/feed/",
  "https://rebelem.com/feed/",
  "https://emergencymedicinecases.com/feed/",
  "https://emcrit.org/feed/",
  "https://www.emdocs.net/feed/",
  "https://www.thebottomline.org.uk/feed/"
];

const KEYWORDS = [
  "tox",
  "toxicology",
  "overdose",
  "poison",
  "intoxication",
  "antidote",
  "envenenamento",
  "intoxicacao",
  "chumbinho",
  "salicylate",
  "acetaminophen"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const NORMALIZED_KEYWORDS = KEYWORDS.map((keyword) => normalizeText(keyword));

function hasToxicologyKeyword(item) {
  const haystack = normalizeText([
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
    item["content:encoded"]
  ].join(" "));

  return NORMALIZED_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return String(value).trim();
}

function getSourceName(feed, feedUrl) {
  if (feed && feed.title && String(feed.title).trim()) {
    return String(feed.title).trim();
  }

  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch (_error) {
    return feedUrl;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function isUrlAlreadySent(supabase, url) {
  const { data, error } = await supabase
    .from("tox_alerts_sent")
    .select("url")
    .eq("url", url)
    .limit(1);

  if (error) {
    throw new Error(`Falha ao consultar Supabase para URL ${url}: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function markUrlAsSent(supabase, url) {
  const { error } = await supabase.from("tox_alerts_sent").insert({ url });

  if (error) {
    throw new Error(`Falha ao gravar URL no Supabase (${url}): ${error.message}`);
  }
}

async function sendTelegramAlert(token, chatId, article) {
  const text = [
    "<b>TOX Radar FOAMed</b>",
    "",
    `<b>Titulo:</b> ${escapeHtml(article.title)}`,
    `<b>Fonte:</b> ${escapeHtml(article.source)}`,
    `<b>Link:</b> <a href=\"${article.url}\">Abrir artigo</a>`
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro ao enviar alerta no Telegram: HTTP ${response.status} - ${body}`);
  }
}

async function processFeed(parser, supabase, telegramToken, chatId, feedUrl) {
  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (error) {
    console.error(`[feed-error] ${feedUrl}: ${error.message}`);
    return { scanned: 0, matched: 0, sent: 0 };
  }

  const source = getSourceName(feed, feedUrl);
  const items = Array.isArray(feed.items) ? feed.items : [];

  let matched = 0;
  let sent = 0;

  for (const item of items) {
    const url = item.link || item.guid;
    if (!url) {
      continue;
    }

    if (!hasToxicologyKeyword(item)) {
      continue;
    }

    matched += 1;

    const alreadySent = await isUrlAlreadySent(supabase, url);
    if (alreadySent) {
      continue;
    }

    const title = item.title || "(Sem titulo)";

    await sendTelegramAlert(telegramToken, chatId, {
      title,
      source,
      url
    });

    await markUrlAsSent(supabase, url);
    sent += 1;

    console.log(`[sent] ${source} :: ${title}`);
  }

  return { scanned: items.length, matched, sent };
}

async function main() {
  const parser = new Parser();

  const supabase = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const telegramToken = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  const telegramChatId = getRequiredEnv("TELEGRAM_CHAT_ID");

  const totals = { scanned: 0, matched: 0, sent: 0 };

  for (const feedUrl of FEEDS) {
    const stats = await processFeed(parser, supabase, telegramToken, telegramChatId, feedUrl);
    totals.scanned += stats.scanned;
    totals.matched += stats.matched;
    totals.sent += stats.sent;
  }

  console.log(
    `Concluido: ${totals.scanned} itens analisados, ${totals.matched} candidatos em toxicologia, ${totals.sent} alertas novos enviados.`
  );
}

main().catch((error) => {
  console.error("Erro fatal no tox-radar:", error.message);
  process.exit(1);
});
