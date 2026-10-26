// ─────────────────────────────────────────────────────────────────────
// AliceMail — Autenticación de acceso
// Un solo usuario (administrador). La contraseña se guarda con scrypt en
// la tabla Setting (clave authPasswordHash). La sesión usa una cookie
// httpOnly firmada con HMAC-SHA256. El primer arranque permite crearla.
// ─────────────────────────────────────────────────────────────────────
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/crypto'
import { signSession, verifySessionToken, SESSION_COOKIE } from '@/lib/session'

const AUTH_KEY = 'authPasswordHash'

export async function hasPassword(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: AUTH_KEY } })
  return Boolean(row && row.value)
}

export async function createPassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')
  await db.setting.upsert({
    where: { key: AUTH_KEY },
    update: { value: hashPassword(password) },
    create: { key: AUTH_KEY, value: hashPassword(password) },
  })
}

export async function checkPassword(password: string): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: AUTH_KEY } })
  return verifyPassword(password, row?.value)
}

export async function changePassword(current: string, next: string): Promise<void> {
  if (!(await checkPassword(current))) throw new Error('La contraseña actual no es correcta')
  await createPassword(next)
}

/** Crea la sesión y establece la cookie httpOnly */
export async function startSession(): Promise<void> {
  const token = await signSession()
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.ALICE_INSECURE_COOKIE !== '1',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

/** Valida la cookie de la petición actual (route handlers / server) */
export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies()
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value)
}
