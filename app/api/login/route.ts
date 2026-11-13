import { NextResponse } from 'next/server'
import { SESSION_COOKIE, cookieOptions, createSession, safeEqual } from '@/lib/auth'

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const expected = process.env.APP_PASSWORD
  if (!expected) return NextResponse.json({ error: 'APP_PASSWORD no está configurado' }, { status: 500 })
  // pequeña pausa para frenar ataques de fuerza bruta
  await new Promise((r) => setTimeout(r, 400))
  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions)
  return res
}
