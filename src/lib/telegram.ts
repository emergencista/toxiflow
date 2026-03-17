type TelegramSendResult = {
  ok: boolean;
  error?: string;
};

export function isTelegram2faConfigured(): boolean {
  return Boolean(process.env.TOXIFLOW_TELEGRAM_BOT_TOKEN && process.env.TOXIFLOW_TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = process.env.TOXIFLOW_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TOXIFLOW_TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, error: "Telegram 2FA não configurado." };
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `Telegram API HTTP ${response.status}` };
    }

    const data = (await response.json()) as { ok?: boolean };
    if (!data.ok) {
      return { ok: false, error: "Telegram API recusou a mensagem." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao enviar Telegram." };
  }
}
