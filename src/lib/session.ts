// ─────────────────────────────────────────────────────────────────────
// AliceMail — Sesión firmada (solo Web Crypto)
// Válido tanto en el runtime edge (middleware) como en node.
// ─────────────────────────────────────────────────────────────────────
export const SESSION_COOKIE = 'alice_session'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

function appSecret(): string {
  return process.env.APP_SECRET || process.env.APP_ENCRYPTION_KEY || 'alicemail-dev-secret-cambiar'
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function signSession(): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `admin.${exp}`
  const sig = await hmac(payload)
  return `${payload}.${sig}`
}

export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [user, expStr, sig] = parts
  const expected = await hmac(`${user}.${expStr}`)
  if (sig.length !== expected.length) return false
  // comparación en tiempo constante
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return false
  const exp = parseInt(expStr, 10)
  return Number.isFinite(exp) && exp > Date.now()
}

/** Rutas API públicas (pixel de apertura, bajas y autenticación) */
export const PUBLIC_API_PATHS = [
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/setup',
  '/api/auth/logout',
  '/api/track/open',
  '/api/unsubscribe',
  '/api/mcp', // usa su propio Bearer token
]
