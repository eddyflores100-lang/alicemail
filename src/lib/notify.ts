// ─────────────────────────────────────────────────────────────────────
// AliceMail — Notificaciones al dueño (Telegram Bot API + WhatsApp Cloud API)
// Nunca lanza: registra el resultado en la tabla Notification.
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export type NotifyEvent = 'reply' | 'hot' | 'bounce' | 'error' | 'daily' | 'test' | 'crm'

/** Envía una notificación a los canales configurados. Devuelve resumen. */
export async function notify(
  event: NotifyEvent,
  title: string,
  body: string
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const s = await getSettings()
  const channel = s.notifyChannel
  if (channel === 'OFF') {
    await log(event, title, body, 'SKIPPED', 'TELEGRAM', 'canal OFF')
    return { sent: 0, failed: 0, skipped: true }
  }
  if (event !== 'test' && !s.notifyEvents.includes(event)) {
    return { sent: 0, failed: 0, skipped: true }
  }

  let sent = 0
  let failed = 0

  if ((channel === 'TELEGRAM' || channel === 'BOTH') && s.notifyTelegramToken && s.notifyTelegramChat) {
    const okTel = await sendTelegram(s.notifyTelegramToken, s.notifyTelegramChat, `🔥 <b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`)
    await log(event, title, body, okTel ? 'SENT' : 'FAILED', 'TELEGRAM', okTel ? null : 'error API Telegram')
    if (okTel) sent++
    else failed++
  }

  if ((channel === 'WHATSAPP' || channel === 'BOTH') && s.notifyWaPhoneId && s.notifyWaToken && s.notifyWaTo) {
    const okWa = await sendWhatsApp(s.notifyWaPhoneId, s.notifyWaToken, s.notifyWaTo, `🔥 *${title}*\n${body}`)
    await log(event, title, body, okWa ? 'SENT' : 'FAILED', 'WHATSAPP', okWa ? null : 'error API WhatsApp')
    if (okWa) sent++
    else failed++
  }

  if (sent === 0 && failed === 0) {
    await log(event, title, body, 'SKIPPED', 'TELEGRAM', 'falta configurar credenciales')
  }
  return { sent, failed, skipped: false }
}

async function log(
  event: string,
  title: string,
  body: string,
  status: string,
  channel: string,
  error: string | null
): Promise<void> {
  try {
    await db.notification.create({
      data: { event, title: title.slice(0, 200), body: body.slice(0, 2000), status, channel, error: error?.slice(0, 300) || null },
    })
  } catch {
    /* la base de datos es más importante que el log */
  }
}

async function sendTelegram(token: string, chatId: string, html: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function sendWhatsApp(phoneId: string, token: string, to: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/[^\d+]/g, ''),
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 4000) },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch {
    return false
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
