// Punto de arranque del motor en el runtime de Next.js
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await migratePlaintextSecrets()
    const { startWorker } = await import('@/lib/worker')
    startWorker()
  }
}

/**
 * Cifra secretos heredados que estuvieran en texto plano (una sola vez).
 * Cubre contraseñas de buzones y tokens de ajustes.
 */
async function migratePlaintextSecrets(): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    const { encryptSecret, isEncrypted } = await import('@/lib/crypto')

    const mailboxes = await db.mailbox.findMany()
    for (const mb of mailboxes) {
      const patch: Record<string, string> = {}
      if (mb.smtpPass && !isEncrypted(mb.smtpPass)) patch.smtpPass = encryptSecret(mb.smtpPass)
      if (mb.imapPass && !isEncrypted(mb.imapPass)) patch.imapPass = encryptSecret(mb.imapPass)
      if (Object.keys(patch).length) {
        await db.mailbox.update({ where: { id: mb.id }, data: patch })
        console.log(`[alicemail] Secretos cifrados para buzón ${mb.email}`)
      }
    }

    const SECRET_SETTING_KEYS = ['notifyTelegramToken', 'notifyWaToken', 'aiApiKey', 'mcpToken']
    const settings = await db.setting.findMany({ where: { key: { in: SECRET_SETTING_KEYS } } })
    for (const row of settings) {
      if (row.value && !isEncrypted(row.value)) {
        await db.setting.update({ where: { key: row.key }, data: { value: encryptSecret(row.value) } })
        console.log(`[alicemail] Secreto cifrado en ajustes: ${row.key}`)
      }
    }
  } catch (e) {
    console.error('[alicemail] Migración de secretos omitida:', e instanceof Error ? e.message : e)
  }
}
