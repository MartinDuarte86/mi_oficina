import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'mo_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 días

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) throw new Error('AUTH_SECRET no está configurado (mínimo 16 caracteres)')
  return new TextEncoder().encode(s)
}

export async function createSession() {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret())
}

export async function verifySession(token?: string) {
  if (!token) return false
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE,
}

/** Comparación en tiempo constante para la contraseña */
export function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}
