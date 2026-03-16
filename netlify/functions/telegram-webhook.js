const { createClient } = require("@supabase/supabase-js");

function parseEventBody(event) {
  if (!event || !event.body) {
    return null;
  }

  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (_error) {
      return null;
    }
  }

  return event.body;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildNewsMessage(rows) {
  if (!rows || rows.length === 0) {
    return [
      "<b>TOX Radar</b>",
      "",
      "Nenhuma atualizacao foi encontrada no banco ate o momento.",
      "Tente novamente mais tarde."
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
    "Fonte: registros mais recentes de tox_alerts_sent"
  ].join("\n");
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Variavel de ambiente obrigatoria ausente: TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar mensagem para Telegram: HTTP ${response.status} - ${body}`);
  }
}

async function getLatestNewsRows() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl) {
    throw new Error("Variavel de ambiente obrigatoria ausente: SUPABASE_URL");
  }

  if (!supabaseKey) {
    throw new Error("Variavel de ambiente obrigatoria ausente: SUPABASE_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase
    .from("tox_alerts_sent")
    .select("url, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(`Erro ao consultar tox_alerts_sent: ${error.message}`);
  }

  return data || [];
}

exports.handler = async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "POST") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, message: "Ignored non-POST request" })
    };
  }

  const payload = parseEventBody(event);
  const message = payload && payload.message ? payload.message : null;
  const text = message && typeof message.text === "string" ? message.text.trim() : "";
  const chatId = message && message.chat ? message.chat.id : null;

  if (text === "/news" && chatId) {
    try {
      const rows = await getLatestNewsRows();
      const replyText = buildNewsMessage(rows);
      await sendTelegramMessage(chatId, replyText);
    } catch (error) {
      console.error("[telegram-webhook] /news error:", error.message);

      try {
        await sendTelegramMessage(
          chatId,
          [
            "<b>TOX Radar</b>",
            "",
            "Nao foi possivel consultar as atualizacoes agora.",
            "Tente novamente em alguns minutos."
          ].join("\n")
        );
      } catch (notifyError) {
        console.error("[telegram-webhook] fallback message error:", notifyError.message);
      }
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true })
  };
};
