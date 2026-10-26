// ─────────────────────────────────────────────────────────────────────
// AliceMail — Capa de criptografía
// · AES-256-GCM para secretos en reposo (contraseñas de buzón, tokens)
// · scrypt para contraseñas de acceso
// · HMAC-SHA256 para cookies de sesión (Web Crypto: funciona en edge y node)
// La clave maestra proviene de APP_ENCRYPTION_KEY (o APP_SECRET como reserva).
// Nunca se guardan claves en la base de datos ni en el repositorio.
// ─────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'

const PREFIX = 'enc:v1:'

function masterKey(): Buffer {
  const secret =
    process.env.APP_ENCRYPTION_KEY ||
    process.env.APP_SECRET ||
    'alicemail-dev-key-cambiar-en-produccion'
  // Derivación determinista a 32 bytes (AES-256)
  return crypto.createHash('sha256').update(`alicemail::${secret}`).digest()
}

/** Cifra un secreto. Idempotente: no re-cifra valores ya cifrados. */
export function encryptSecret(plain: string | null | undefined): string {
  const value = plain || ''
  if (!value || value.startsWith(PREFIX)) return value
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv)
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Descifra un secreto; valores legados (sin prefijo) se devuelven tal cual. */
export function decryptSecret(stored: string | null | undefined): string {
  const value = stored || ''
  if (!value) return ''
  if (!value.startsWith(PREFIX)) return value
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':')
    if (!ivB64 || !tagB64 || !ctB64) return ''
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    // Clave cambiada o valor corrupto: no filtrar, devolver vacío
    return ''
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(PREFIX))
}

/** Máscara para mostrar en UI: nunca devuelve el secreto real */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  const tail = value.slice(-4)
  return `••••••••${tail}`
}

// ─── Contraseña de acceso (scrypt) ───────────────────────────────────

const SCRYPT_N = 16384

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 })
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false
  const N = parseInt(parts[1], 10) || SCRYPT_N
  const salt = Buffer.from(parts[2], 'hex')
  const expected = Buffer.from(parts[3], 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r: 8, p: 1 })
  return crypto.timingSafeEqual(actual, expected)
}

// ─── Sesión: implementación en src/lib/session.ts (Web Crypto) ──────

// ─── Utilidades ──────────────────────────────────────────────────────

/** Comparación en tiempo constante para tokens de igual longitud razonable */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url')
}
