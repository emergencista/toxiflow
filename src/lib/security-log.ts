import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

type SecurityEvent = {
  type: string;
  actor?: string;
  success?: boolean;
  ip?: string;
  details?: Record<string, unknown>;
};

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "security-audit.log");

export async function writeSecurityEvent(event: SecurityEvent): Promise<void> {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Avoid breaking primary flows because of logging failures.
  }
}
