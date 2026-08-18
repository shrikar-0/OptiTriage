/**
 * src/lib/smsGateway.ts
 *
 * WhatsApp Web gateway using whatsapp-web.js.
 *
 * On server start the client will emit a QR code in the terminal.
 * Scan it once with your phone via WhatsApp → Linked Devices.
 * LocalAuth persists the session to disk so re-scanning is not required
 * across server restarts.
 *
 * Usage:
 *   import { initWhatsApp, sendScanLink } from './lib/smsGateway';
 *   await initWhatsApp();          // call once at startup
 *   await sendScanLink(phone, url); // call per patient session
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

// ─── Client singleton ─────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session', // single named folder, not scattered files
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--aggressive-cache-discard',
      '--disable-cache',
      '--disable-application-cache',
    ],
  },
});

let _isReady = false;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

client.on('qr', (qr) => {
  console.log('[whatsapp] Scan the QR code below with WhatsApp → Linked Devices:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[whatsapp] ✓ WhatsApp connected — automated messages enabled.');
  _isReady = true;
});

client.on('authenticated', () => {
  console.log('[whatsapp] Session authenticated (credentials cached).');
});

client.on('auth_failure', (msg) => {
  console.error('[whatsapp] Authentication failure:', msg);
  _isReady = false;
});

client.on('disconnected', (reason) => {
  console.warn('[whatsapp] Client disconnected:', reason);
  _isReady = false;
});

/**
 * Call once during server startup to boot the WhatsApp client.
 * Resolves immediately; readiness is confirmed via the 'ready' event.
 */
export function initWhatsApp(): void {
  console.log('[whatsapp] Initialising WhatsApp client...');
  client.initialize().catch((err: Error) => {
    console.error('[whatsapp] Failed to initialise client:', err.message);
  });
}

/**
 * Graceful shutdown — call before process.exit so Puppeteer is cleaned up.
 */
export async function destroyWhatsApp(): Promise<void> {
  await client.destroy().catch(() => {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sends the scan link to the patient's WhatsApp number.
 *
 * @param phone   Raw phone string entered by the doctor (e.g. "9876543210").
 *                If falsy, the call is skipped silently.
 * @param scanUrl Full triage URL to include in the message.
 * @returns       `true` if the message was dispatched, `false` otherwise.
 */
export async function sendScanLink(phone: string | undefined, scanUrl: string): Promise<boolean> {
  if (!phone) return false;

  if (!_isReady) {
    console.warn('[whatsapp] Client not ready — message skipped for this session.');
    return false;
  }

  try {
    // Strip non-numeric characters
    const digits = phone.replace(/\D/g, '');
    // Prepend country code for 10-digit Indian numbers
    const waNumber = digits.length === 10 ? `91${digits}` : digits;
    // Append @c.us domain required by whatsapp-web.js
    const chatId = `${waNumber}@c.us`;

    const message =
      `Hello! Your doctor has sent you a remote vitals scan request via OptiTriage.\n\n` +
      `Please tap the secure link below to begin:\n${scanUrl}\n\n` +
      `This link expires in 30 minutes.`;

    await client.sendMessage(chatId, message);
    console.log(`[whatsapp] ✓ Scan link dispatched to ${waNumber}`);
    return true;
  } catch (err) {
    console.error('[whatsapp] Failed to send message:', (err as Error).message);
    return false;
  }
}
