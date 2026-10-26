// Capa de correo: envío SMTP (nodemailer) y lectura IMAP (imapflow)
// Las contraseñas llegan cifradas desde la BD; se descifran SOLO aquí, en memoria.
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import type { Mailbox } from '@prisma/client'
import { decryptSecret } from '@/lib/crypto'

const SMTP_TIMEOUT = 20_000

export function createTransport(mb: Pick<Mailbox, 'smtpHost' | 'smtpPort' | 'smtpSecure' | 'smtpUser' | 'smtpPass'>) {
  return nodemailer.createTransport({
    host: mb.smtpHost,
    port: mb.smtpPort,
    secure: mb.smtpSecure,
    auth: { user: mb.smtpUser, pass: decryptSecret(mb.smtpPass) },
    connectionTimeout: SMTP_TIMEOUT,
    greetingTimeout: SMTP_TIMEOUT,
    socketTimeout: SMTP_TIMEOUT,
  })
}

export interface SendArgs {
  fromName: string
  to: string
  subject: string
  text: string
  html: string
  headers?: Record<string, string>
  inReplyTo?: string
  references?: string
}

export async function sendViaSmtp(
  mb: Pick<Mailbox, 'smtpHost' | 'smtpPort' | 'smtpSecure' | 'smtpUser' | 'smtpPass' | 'email'>,
  args: SendArgs
): Promise<{ messageId: string }> {
  const t = createTransport(mb)
  const info = await t.sendMail({
    from: `"${args.fromName}" <${mb.email}>`,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    headers: args.headers,
    inReplyTo: args.inReplyTo,
    references: args.references,
  })
  return { messageId: info.messageId || `am-${Date.now()}@alicemail` }
}

/** Verifica credenciales SMTP + IMAP de un buzón */
export async function testMailbox(mb: Mailbox): Promise<{
  ok: boolean
  smtp: boolean
  imap: boolean
  error?: string
}> {
  let smtp = false
  let imap = false
  let error: string | undefined
  try {
    const t = createTransport(mb)
    await t.verify()
    smtp = true
  } catch (e) {
    error = `SMTP: ${e instanceof Error ? e.message : String(e)}`
  }
  try {
    const c = new ImapFlow({
      host: mb.imapHost,
      port: mb.imapPort,
      secure: mb.imapSecure,
      auth: { user: mb.imapUser, pass: decryptSecret(mb.imapPass) },
      logger: false,
      connectionTimeout: SMTP_TIMEOUT,
    })
    await c.connect()
    await c.logout()
    imap = true
  } catch (e) {
    const msg = `IMAP: ${e instanceof Error ? e.message : String(e)}`
    error = error ? `${error} | ${msg}` : msg
  }
  return { ok: smtp && imap, smtp, imap, error }
}

export interface FetchedMessage {
  messageId: string
  fromEmail: string
  subject: string
  body: string
  date: Date
}

function htmlToText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3000)
}

/** Descarga mensajes nuevos de INBOX desde `since` */
export async function fetchImapMessages(
  mb: Pick<Mailbox, 'imapHost' | 'imapPort' | 'imapSecure' | 'imapUser' | 'imapPass'>,
  since: Date
): Promise<FetchedMessage[]> {
  const client = new ImapFlow({
    host: mb.imapHost,
    port: mb.imapPort,
    secure: mb.imapSecure,
    auth: { user: mb.imapUser, pass: decryptSecret(mb.imapPass) },
    logger: false,
    connectionTimeout: SMTP_TIMEOUT,
  })
  await client.connect()
  const lock = client.getMailboxLock('INBOX')
  const out: FetchedMessage[] = []
  try {
    for await (const msg of client.fetch(
      { since },
      { envelope: true, source: true, uid: true }
    )) {
      if (!msg.envelope?.messageId) continue
      const fromAddr = msg.envelope.from?.[0]?.address || ''
      if (!fromAddr) continue
      const raw = msg.source?.toString('utf8') || ''
      // cuerpo aproximado: toma lo que sigue a las cabeceras
      const sep = raw.indexOf('\r\n\r\n')
      const bodyRaw = sep >= 0 ? raw.slice(sep + 4) : raw
      const body = htmlToText(bodyRaw)
      out.push({
        messageId: msg.envelope.messageId,
        fromEmail: fromAddr.toLowerCase(),
        subject: msg.envelope.subject || '(sin asunto)',
        body,
        date: msg.envelope.date || new Date(),
      })
      if (out.length >= 30) break
    }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {
      /* conexión ya cerrada */
    }
  }
  return out
}

/** Preajustes conocidos de proveedores */
export const PROVIDER_PRESETS: Record<
  string,
  { smtpHost: string; smtpPort: number; smtpSecure: boolean; imapHost: string; imapPort: number; imapSecure: boolean }
> = {
  GMAIL: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
  },
  M365: {
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
  },
  SMTP: {
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
  },
}
